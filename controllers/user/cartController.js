const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');

// Get Cart Page
const getCartPage = async (req, res) => {
    try {
      const userId = req.session.user;
      const cart = await Cart.findOne({ userID: userId }).populate({
        path: 'item.productID',
        select: 'productName productImage regularPrice salePrice size status isBlocked isListed',
      });

      if (!cart || cart.item.length === 0) {
        return res.render('cart', {
          cartItems: [],
          subtotal: 0,
          total: 0,
          cartCount: res.locals.cartCount || 0,
        });
      }

      let subtotal = 0;

      // Map cart items to include discountPercentage
      const cartItems = cart.item.map(item => {
        const product = item.productID;
        // Calculate discountPercentage
        const discountPercentage = product.regularPrice > product.salePrice
          ? Math.round(((product.regularPrice - product.salePrice) / product.regularPrice) * 100)
          : 0;

        // Check stock for each size
        item.size.forEach((sizeItem) => {
          const productSize = product.size.find((s) => s.size === sizeItem.size);
          if (productSize && productSize.quantity === 0) {
            product.status = 'Out of Stock';
          }
        });

        // Use salePrice for totalPrice calculation
        const itemTotalPrice = item.size.reduce((total, sizeItem) => {
          return total + (sizeItem.quantity * product.salePrice);
        }, 0);

        subtotal += itemTotalPrice;

        return {
          ...item.toObject(),
          price: product.salePrice, // Use salePrice for display
          productID: {
            ...product.toObject(),
            discountPercentage, // Add discountPercentage to productID
            regularPrice: product.regularPrice, // Ensure regularPrice is included
          },
          totalPrice: itemTotalPrice, // Update totalPrice for the item
        };
      });

      const total = subtotal;

      res.render('cart', {
        cartItems,
        subtotal,
        total,
        cartCount: res.locals.cartCount || cartItems.reduce((count, item) => count + item.size.length, 0),
      });
    } catch (error) {
      console.error('Error loading cart:', error);
      res.redirect('/pageNotFound');
    }
};
// Add to Cart
const addToCart = async (req, res) => {
    try {
        const { productId, size, quantity = 1 } = req.body;
        const userId = req.session.user;

        const product = await Product.findById(productId)
            .populate('category');

        if (!product || product.isBlocked || !product.isListed ||
            product.category.isBlocked || !product.category.isListed) {
            return res.status(400).json({
                success: false,
                message: 'Product is not available'
            });
        }

        const productSize = product.size.find(s => s.size === size);
        if (!productSize || productSize.quantity < quantity || product.status === 'Out of Stock') {
            return res.status(400).json({
                success: false,
                message: 'Insufficient stock or product is out of stock',
                isOutOfStock: true
            });
        }

        // Check quantity limit per size
        if (quantity > 5) {
            return res.status(400).json({
                success: false,
                message: 'Maximum quantity limit is 5 per size'
            });
        }

        let cart = await Cart.findOne({ userID: userId });

        if (!cart) {
            cart = new Cart({ userID: userId, item: [] });
        }

        const existingItemIndex = cart.item.findIndex(
            item => item.productID.toString() === productId
        );

        if (existingItemIndex !== -1) {
            const existingSizeIndex = cart.item[existingItemIndex].size.findIndex(
                s => s.size === size
            );

            if (existingSizeIndex !== -1) {
                const newQuantity = cart.item[existingItemIndex].size[existingSizeIndex].quantity + Number(quantity);
                
                // Check per-size quantity limit
                if (newQuantity > 5) {
                    return res.status(400).json({
                        success: false,
                        message: 'Maximum quantity limit is 5 per size'
                    });
                }
                
                if (productSize.quantity < newQuantity) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cannot add more than available stock'
                    });
                }

                cart.item[existingItemIndex].size[existingSizeIndex].quantity = newQuantity;
                let itemTotalQuantity = 0;
                cart.item[existingItemIndex].size.forEach(s => {
                    itemTotalQuantity += s.quantity;
                });
                cart.item[existingItemIndex].totalPrice = itemTotalQuantity * product.salePrice;
            } else {
                // Check if adding a new size would exceed per-size limit
                if (quantity > 5) {
                    return res.status(400).json({
                        success: false,
                        message: 'Maximum quantity limit is 5 per size'
                    });
                }
                
                cart.item[existingItemIndex].size.push({
                    size: size,
                    quantity: Number(quantity)
                });
                let itemTotalQuantity = 0;
                cart.item[existingItemIndex].size.forEach(s => {
                    itemTotalQuantity += s.quantity;
                });
                cart.item[existingItemIndex].totalPrice = itemTotalQuantity * product.salePrice;
            }
        } else {
            // Check if new item's quantity exceeds per-size limit
            if (quantity > 5) {
                return res.status(400).json({
                    success: false,
                    message: 'Maximum quantity limit is 5 per size'
                });
            }
            
            cart.item.push({
                productID: productId,
                size: [{
                    size: size,
                    quantity: Number(quantity)
                }],
                price: product.salePrice,
                totalPrice: quantity * product.salePrice
            });
        }

        await cart.save();

        const cartCount = cart.item.length;

        res.status(200).json({
            success: true,
            message: 'Product added to cart',
            cartCount: cartCount
        });

    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add to cart'
        });
    }
};


// Update Cart Item Quantity
const updateCartItem = async (req, res) => {
    try {
        const { itemId, sizeValue, newQuantity } = req.body;
        const userId = req.session.user;

        if (newQuantity > 5) {
            return res.status(400).json({
                success: false,
                message: 'Maximum quantity limit is 5 per size'
            });
        }

        const cart = await Cart.findOne({ userID: userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        const itemIndex = cart.item.findIndex(item => item._id.toString() === itemId);
        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in cart'
            });
        }

        const sizeIndex = cart.item[itemIndex].size.findIndex(s => s.size === sizeValue);
        if (sizeIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Size not found for this item'
            });
        }

        const product = await Product.findById(cart.item[itemIndex].productID);
        const productSize = product.size.find(s => s.size === sizeValue);

        if (!productSize || productSize.quantity < newQuantity || product.status === 'Out of Stock') {
            return res.status(400).json({
                success: false,
                message: 'Insufficient stock or product is out of stock',
                isOutOfStock: product.status === 'Out of Stock'
            });
        }

        cart.item[itemIndex].size[sizeIndex].quantity = Number(newQuantity);
        let itemTotalQuantity = 0;
        cart.item[itemIndex].size.forEach(s => {
            itemTotalQuantity += s.quantity;
        });
        cart.item[itemIndex].totalPrice = itemTotalQuantity * cart.item[itemIndex].price;

        await cart.save();

        let subtotal = 0;
        cart.item.forEach(item => {
            subtotal += item.totalPrice;
        });

        res.status(200).json({
            success: true,
            subtotal: subtotal,
            total: subtotal,
            itemTotal: cart.item[itemIndex].totalPrice,
            maxQuantityReached: newQuantity >= productSize.quantity,
            isOutOfStock: product.status === 'Out of Stock'
        });

    } catch (error) {
        console.error('Error updating cart item:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update cart'
        });
    }
};

// Remove size from cart item
const removeSizeFromItem = async (req, res) => {
    try {
        const { itemId, sizeValue } = req.body;
        const userId = req.session.user;

        const cart = await Cart.findOne({ userID: userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        const itemIndex = cart.item.findIndex(item => item._id.toString() === itemId);
        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in cart'
            });
        }

        cart.item[itemIndex].size = cart.item[itemIndex].size.filter(s => s.size !== sizeValue);
        
        if (cart.item[itemIndex].size.length === 0) {
            cart.item = cart.item.filter(item => item._id.toString() !== itemId);
        } else {
            let itemTotalQuantity = 0;
            cart.item[itemIndex].size.forEach(s => {
                itemTotalQuantity += s.quantity;
            });
            cart.item[itemIndex].totalPrice = itemTotalQuantity * cart.item[itemIndex].price;
        }

        await cart.save();

        let subtotal = 0;
        cart.item.forEach(item => {
            subtotal += item.totalPrice;
        });

        res.status(200).json({
            success: true,
            subtotal: subtotal,
            total: subtotal,
            cartCount: cart.item.length,
            itemRemoved: cart.item.findIndex(item => item._id.toString() === itemId) === -1
        });

    } catch (error) {
        console.error('Error removing size from item:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove size from item'
        });
    }
};

// Remove from Cart
const removeFromCart = async (req, res) => {
    try {
        const { itemId } = req.body;
        const userId = req.session.user;

        const cart = await Cart.findOne({ userID: userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        cart.item = cart.item.filter(item => item._id.toString() !== itemId);

        await cart.save();

        let subtotal = 0;
        cart.item.forEach(item => {
            subtotal += item.totalPrice;
        });

        res.status(200).json({
            success: true,
            subtotal: subtotal,
            total: subtotal,
            cartCount: cart.item.length
        });

    } catch (error) {
        console.error('Error removing from cart:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove from cart'
        });
    }
};



module.exports = {
    getCartPage,
    addToCart,
    updateCartItem,
    removeSizeFromItem,
    removeFromCart,
    
};