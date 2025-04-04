const Address = require('../../models/addressSchema');
const User = require('../../models/userSchema');

// Get addresses for checkout page (API endpoint)
const getCheckoutAddresses = async (req, res) => {
  try {
    const userId = req.session.user;
    const addresses = await Address.findOne({ userID: userId });
    
    res.status(200).json({
      success: true,
      addresses: addresses || { address: [] }
    });
  } catch (error) {
    console.error('Error fetching addresses for checkout:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch addresses'
    });
  }
};

// Add new address during checkout
const addCheckoutAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const { label, street, city, state, zipCode, country, phone } = req.body;

    // Validation specific to checkout
    if (!label || !street || !city || !state || !zipCode || !country || !phone) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required for shipping'
      });
    }

    // Convert zipCode to number and validate
    const numericZipCode = Number(zipCode);
    if (isNaN(numericZipCode)) {
      return res.status(400).json({
        success: false,
        message: 'Postal code must be a number'
      });
    }

    let addressDoc = await Address.findOne({ userID: userId });

    if (!addressDoc) {
      addressDoc = new Address({
        userID: userId,
        address: []
      });
    }

    // Add new address with numeric zipCode
    addressDoc.address.push({
      label,
      street,
      city,
      state,
      zipCode: numericZipCode, // Use the converted number
      country,
      phone
    });

    await addressDoc.save();

    res.status(200).json({
      success: true,
      message: 'Address added successfully',
      addresses: addressDoc
    });

  } catch (error) {
    console.error('Error adding checkout address:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add address'
    });
  }
};

// Edit address during checkout
const editCheckoutAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.params;
    const { label, street, city, state, zipCode, country, phone } = req.body;

    // Validation specific to checkout
    if (!label || !street || !city || !state || !zipCode || !country || !phone) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required for shipping'
      });
    }

    // Convert zipCode to number and validate
    const numericZipCode = Number(zipCode);
    if (isNaN(numericZipCode)) {
      return res.status(400).json({
        success: false,
        message: 'Postal code must be a number'
      });
    }

    const addressDoc = await Address.findOne({ userID: userId });

    if (!addressDoc) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Find and update the specific address
    const addressIndex = addressDoc.address.findIndex(addr => addr._id.toString() === addressId);
    if (addressIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Update address with numeric zipCode
    addressDoc.address[addressIndex] = {
      ...addressDoc.address[addressIndex],
      label,
      street,
      city,
      state,
      zipCode: numericZipCode, // Use the converted number
      country,
      phone
    };

    await addressDoc.save();

    res.status(200).json({
      success: true,
      message: 'Address updated successfully',
      addresses: addressDoc
    });

  } catch (error) {
    console.error('Error editing checkout address:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update address'
    });
  }
};

module.exports = {
  getCheckoutAddresses,
  addCheckoutAddress,
  editCheckoutAddress
};