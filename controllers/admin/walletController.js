const Wallet = require('../../models/walletSchema');
const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');

const getAdminWallets = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    let query = {};
    if (search) {
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      query.userID = { $in: users.map(user => user._id) };
    }

    const wallets = await Wallet.find(query)
      .populate('userID', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalWallets = await Wallet.countDocuments(query);
    const totalPages = Math.ceil(totalWallets / limit);

    res.render('admin-wallets', {
      wallets,
      currentPage: page,
      totalPages,
      totalWallets,
      search,
      limit
    });
  } catch (error) {
    console.error('Error fetching wallets:', error);
    res.status(500).render('admin/error', { message: 'Server Error' });
  }
};

const getWalletTransactions = async (req, res) => {
  try {
    const { walletId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const wallet = await Wallet.findById(walletId).populate('userID', 'name email');
    if (!wallet) {
      return res.status(404).render('admin/error', { message: 'Wallet not found' });
    }

    const transactions = wallet.transactions
      .sort((a, b) => b.date - a.date)
      .slice((page - 1) * limit, page * limit);

    const totalTransactions = wallet.transactions.length;
    const totalPages = Math.ceil(totalTransactions / limit);

    // Fetch order details for transactions with orderID
    const transactionsWithOrders = await Promise.all(
      transactions.map(async (transaction) => {
        if (transaction.orderID) {
          const order = await Order.findOne({ orderID: transaction.orderID });
          return { ...transaction.toObject(), order };
        }
        return transaction;
      })
    );

    res.render('admin-wallet-transactions', {
      wallet,
      transactions: transactionsWithOrders,
      currentPage: page,
      totalPages,
      totalTransactions,
      limit
    });
  } catch (error) {
    console.error('Error fetching wallet transactions:', error);
    res.status(500).render('admin/error', { message: 'Server Error' });
  }
};

const getTransactionDetails = async (req, res) => {
  try {
    const { walletId, transactionId } = req.params;

    const wallet = await Wallet.findById(walletId).populate('userID', 'name email phone');
    if (!wallet) {
      return res.status(404).render('admin/error', { message: 'Wallet not found' });
    }

    const transaction = wallet.transactions.id(transactionId);
    if (!transaction) {
      return res.status(404).render('admin/error', { message: 'Transaction not found' });
    }

    let order = null;
    if (transaction.orderID) {
      order = await Order.findOne({ orderID: transaction.orderID }).populate('orderItems.product');
    }

    res.render('admin-transaction-details', {
      wallet,
      transaction,
      order
    });
  } catch (error) {
    console.error('Error fetching transaction details:', error);
    res.status(500).render('admin/error', { message: 'Server Error' });
  }
};

module.exports = {
  getAdminWallets,
  getWalletTransactions,
  getTransactionDetails
};