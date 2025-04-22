const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const PDFDocument = require('pdfkit-table'); 
const fs = require('fs');
const ExcelJS = require('exceljs');

const getAdminOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sort = req.query.sort || '-createdOn';
    const search = req.query.search || '';
    const statusFilter = req.query.status || '';

    // Build query
    let query = {};
    if (search) {
      query.$or = [
        { orderID: { $regex: search, $options: 'i' } },
        { 'userID.email': { $regex: search, $options: 'i' } }
      ];
    }

    const orders = await Order.find(query)
      .populate('userID', 'name email')
      .populate('orderItems.product')
      .sort(sort);

    // Flatten orders into a list of items
    const orderItems = [];
    orders.forEach(order => {
      order.orderItems.forEach(item => {
        orderItems.push({
          orderID: order.orderID,
          createdOn: order.createdOn,
          user: order.userID,
          item: item,
          paymentMethod: order.paymentMethod
        });
      });
    });

    // Apply status filter to items
    let filteredItems = orderItems;
    if (statusFilter) {
      filteredItems = orderItems.filter(item => item.item.status === statusFilter);
    }

    // Pagination
    const totalItems = filteredItems.length;
    const paginatedItems = filteredItems.slice((page - 1) * limit, page * limit);

    res.render('admin-orders', {
      orderItems: paginatedItems,
      currentPage: page,
      totalPages: Math.ceil(totalItems / limit),
      totalItems,
      sort,
      search,
      statusFilter,
      limit
    });
  } catch (error) {
    console.error('Error fetching admin orders:', error);
    res.status(500).render('admin/error', { message: 'Server Error' });
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderID: orderId })
      .populate('userID', 'name email')
      .populate('orderItems.product');

    if (!order) {
      return res.status(404).render('admin/error', { message: 'Order not found' });
    }

    res.render('admin-order-details', {
      order,
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).render('admin/error', { message: 'Server Error' });
  }
};

const updateOrderItemStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, size, status } = req.body;

    const order = await Order.findOne({ orderID: orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned', 'Return Request', 'Return Rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const orderItem = order.orderItems.find(item =>
      item.product.toString() === productId && item.size === size
    );

    if (!orderItem) {
      return res.status(404).json({ success: false, message: 'Order item not found' });
    }

    if (orderItem.status === 'Delivered' && status === 'Shipped') {
      return res.status(400).json({ success: false, message: 'Cannot revert to Shipped after Delivered' });
    }

    orderItem.status = status;

    if (status === 'Cancelled' || status === 'Returned') {
      const product = await Product.findById(productId);
      const sizeVariant = product.size.find(s => s.size === size);
      if (sizeVariant) {
        sizeVariant.quantity += orderItem.quantity;
        await product.save();
      }
    }

    await order.save();

    return res.json({ success: true, message: 'Product status updated successfully' });
  } catch (error) {
    console.error('Error updating product status:', error);
    return res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};


const verifyReturnRequest = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, size, action } = req.body;

    const order = await Order.findOne({ orderID: orderId }).populate('userID');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = order.orderItems.find(i =>
      i.product.toString() === productId && i.size === size
    );

    if (!item || item.status !== 'Return Request') {
      return res.status(400).json({ success: false, message: 'Item not found or not eligible for return' });
    }

    if (action === 'accept') {
      item.status = 'Returned';
      const itemCount = order.orderItems.length;
      const perItemDiscount = order.discount > 0 && itemCount > 0 ? order.discount / itemCount : 0;
      const refundAmount = (item.price * item.quantity) - perItemDiscount;

      // Refund to user's wallet
      let wallet = await Wallet.findOne({ userID: order.userID });
      if (!wallet) {
        wallet = new Wallet({ userID: order.userID });
      }
      wallet.balance += refundAmount;
      wallet.transactions.push({
        type: 'credit',
        amount: refundAmount,
        description: item.returnReason,
        orderID: orderId
      });
      await wallet.save();

      const product = await Product.findById(productId);
      const sizeVariant = product.size.find(s => s.size === size);
      if (sizeVariant) {
        sizeVariant.quantity += item.quantity;
        await product.save();
      }
    } else if (action === 'reject') {
      item.status = 'Return Rejected';
    }

    await order.save();

    res.json({ success: true, message: `Return request ${action}ed` });
  } catch (error) {
    console.error('Error processing return:', error);
    res.status(500).json({ success: false, message: 'Failed to process return' });
  }
};



const getSalesReport = async (req, res) => {
  try {
    const { range, startDate, endDate } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10; 

   
    let dateFilter = {};
    const now = new Date();

    switch (range) {
      case 'daily':
        dateFilter = {
          createdOn: {
            $gte: new Date(now.setHours(0, 0, 0, 0)),
            $lte: new Date(now.setHours(23, 59, 59, 999)),
          },
        };
        break;
      case 'weekly':
        const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
        weekStart.setHours(0, 0, 0, 0);
        dateFilter = {
          createdOn: {
            $gte: weekStart,
            $lte: new Date(),
          },
        };
        break;
      case 'monthly':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFilter = {
          createdOn: {
            $gte: monthStart,
            $lte: new Date(),
          },
        };
        break;
      case 'yearly':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        dateFilter = {
          createdOn: {
            $gte: yearStart,
            $lte: new Date(),
          },
        };
        break;
      case 'custom':
        if (startDate && endDate) {
          dateFilter = {
            createdOn: {
              $gte: new Date(startDate),
              $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
            },
          };
        }
        break;
      default:

        break;
    }


    const totalOrders = await Order.countDocuments(dateFilter);

    const paginatedOrders = await Order.find(dateFilter)
      .populate('userID', 'name email')
      .populate('orderItems.product')
      .sort({ createdOn: -1 })
      .skip((page - 1) * limit)
      .limit(limit);


    const allOrders = await Order.find(dateFilter);

  
    const aggregateData = await Order.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$finalAmount" },
          totalDiscounts: { $sum: "$discount" }
        }
      }
    ]);


    const salesData = {
      totalOrders: totalOrders,
      totalAmount: aggregateData.length > 0 ? aggregateData[0].totalAmount : 0,
      totalDiscounts: aggregateData.length > 0 ? aggregateData[0].totalDiscounts : 0,
      chartLabels: [],
      monthlyData: [],
    };


    if (range === 'yearly' || range === 'custom') {

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyTotals = Array(12).fill(0);
      const start = range === 'custom' ? new Date(startDate) : new Date(now.getFullYear(), 0, 1);
      const end = range === 'custom' ? new Date(endDate) : new Date();

      allOrders.forEach(order => {
        const month = order.createdOn.getMonth();
        if (order.createdOn >= start && order.createdOn <= end) {
          monthlyTotals[month] += order.finalAmount;
        }
      });

      salesData.chartLabels = months;
      salesData.monthlyData = monthlyTotals;
    } else if (range === 'monthly') {

      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dailyTotals = Array(daysInMonth).fill(0);
      const labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);

      allOrders.forEach(order => {
        const day = order.createdOn.getDate() - 1;
        dailyTotals[day] += order.finalAmount;
      });

      salesData.chartLabels = labels;
      salesData.monthlyData = dailyTotals;
    } else if (range === 'weekly') {

      const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const weeklyTotals = Array(7).fill(0);

      allOrders.forEach(order => {
        const day = order.createdOn.getDay();
        weeklyTotals[day] += order.finalAmount;
      });

      salesData.chartLabels = labels;
      salesData.monthlyData = weeklyTotals;
    } else if (range === 'daily') {

      const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
      const hourlyTotals = Array(24).fill(0);

      allOrders.forEach(order => {
        const hour = order.createdOn.getHours();
        hourlyTotals[hour] += order.finalAmount;
      });

      salesData.chartLabels = labels;
      salesData.monthlyData = hourlyTotals;
    } else {

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyTotals = Array(12).fill(0);

      allOrders.forEach(order => {
        const month = order.createdOn.getMonth();
        monthlyTotals[month] += order.finalAmount;
      });

      salesData.chartLabels = months;
      salesData.monthlyData = monthlyTotals;
    }

    res.render('admin-sales-report', {
      orders: paginatedOrders,
      salesData,
      range: range || 'all',
      startDate,
      endDate,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
      limit
    });
  } catch (error) {
    console.error('Error fetching sales report:', error);
    res.status(500).render('admin/error', { message: 'Server Error' });
  }
};


const downloadSalesReport = async (req, res) => {
  try {
    const { format, range, startDate, endDate } = req.query;


    let dateFilter = {};
    const now = new Date();

    switch (range) {
      case 'daily':
        dateFilter = {
          createdOn: {
            $gte: new Date(now.setHours(0, 0, 0, 0)),
            $lte: new Date(now.setHours(23, 59, 59, 999)),
          },
        };
        break;
      case 'weekly':
        const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
        weekStart.setHours(0, 0, 0, 0);
        dateFilter = {
          createdOn: {
            $gte: weekStart,
            $lte: new Date(),
          },
        };
        break;
      case 'monthly':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFilter = {
          createdOn: {
            $gte: monthStart,
            $lte: new Date(),
          },
        };
        break;
      case 'yearly':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        dateFilter = {
          createdOn: {
            $gte: yearStart,
            $lte: new Date(),
          },
        };
        break;
      case 'custom':
        if (startDate && endDate) {
          dateFilter = {
            createdOn: {
              $gte: new Date(startDate),
              $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
            },
          };
        }
        break;
      default:
        break;
    }


    const orders = await Order.find(dateFilter)
      .populate('userID', 'name email')
      .populate('orderItems.product')
      .sort({ createdOn: -1 });


    const aggregateData = await Order.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$finalAmount" },
          totalDiscounts: { $sum: "$discount" },
        },
      },
    ]);

    const salesData = {
      totalOrders: orders.length,
      totalAmount: aggregateData.length > 0 ? aggregateData[0].totalAmount : 0,
      totalDiscounts: aggregateData.length > 0 ? aggregateData[0].totalDiscounts : 0,
    };

    if (format === 'pdf') {

      const doc = new PDFDocument({ margin: 30 });
      let buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        let pdfData = Buffer.concat(buffers);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=sales_report.pdf');
        res.send(pdfData);
      });

    
      doc.fontSize(20).text('Sales Report', { align: 'center' });
      doc.moveDown(1);

      doc.fontSize(12).text(`Date Range: ${range}${range === 'custom' ? ` (${startDate} to ${endDate})` : ''}`, { align: 'left' });
      doc.moveDown(1);


      const summaryTable = {
        headers: ['Metric', 'Value'],
        rows: [
          ['Total Orders', salesData.totalOrders.toString()],
          ['Total Amount', `${salesData.totalAmount.toFixed(2)}`],
          ['Total Discounts', `${salesData.totalDiscounts.toFixed(2)}`],
        ],
      };

      await doc.table(summaryTable, {
        columnsSize: [200, 200],
        padding: 5,
        headerColor: '#895D39',
        headerOpacity: 0.9,
        textAlign: 'left',
      });

      doc.moveDown(2);

  
      doc.fontSize(14).text('Order Details:', { underline: true });
      doc.moveDown(1);

      const orderTable = {
        headers: ['Order ID', 'Date', 'Customer', 'Amount', 'Discount', 'Coupon', 'Status'],
        rows: orders.map((order) => [
          order.orderID,
          order.createdOn.toLocaleDateString(),
          order.userID.name,
          `${order.finalAmount.toFixed(2)}`,
          `${order.discount.toFixed(2)}`,
          order.couponCode || 'None',
          order.orderItems[0].status,
        ]),
      };

      await doc.table(orderTable, {
        columnsSize: [80, 80, 100, 60, 60, 60, 80], // Adjust column widths for each column
        padding: 5,
        headerColor: '#895D39',
        headerOpacity: 0.9,
        textAlign: 'left',
        minHeight: 20, // Ensure rows have enough height
      });

      doc.end();
    } else if (format === 'excel') {
  
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sales Report');

      worksheet.addRow(['Sales Report']);
      worksheet.addRow(['Date Range', range === 'custom' ? `${startDate} to ${endDate}` : range]);
      worksheet.addRow([]);
      worksheet.addRow(['Total Orders', salesData.totalOrders]);
      worksheet.addRow(['Total Amount', `${salesData.totalAmount.toFixed(2)}`]);
      worksheet.addRow(['Total Discounts', `${salesData.totalDiscounts.toFixed(2)}`]);
      worksheet.addRow([]);

      worksheet.addRow(['Order ID', 'Date', 'Customer', 'Amount', 'Discount', 'Coupon', 'Status']);
      orders.forEach((order) => {
        worksheet.addRow([
          order.orderID,
          order.createdOn.toLocaleDateString(),
          order.userID.name,
          `${order.finalAmount.toFixed(2)}`,
          `${order.discount.toFixed(2)}`,
          order.couponCode || 'None',
          order.orderItems[0].status,
        ]);
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=sales_report.xlsx');
      await workbook.xlsx.write(res);
      res.end();
    } else {
      res.status(400).json({ success: false, message: 'Invalid format' });
    }
  } catch (error) {
    console.error('Error downloading sales report:', error);
    res.status(500).json({ success: false, message: 'Failed to download report' });
  }
};


const getChartData = async (req, res) => {
  try {
    const { range, startDate, endDate } = req.query;
    let dateFilter = {};
    const now = new Date();

    switch (range) {
      case 'daily':
        dateFilter = {
          createdOn: {
            $gte: new Date(now.setHours(0, 0, 0, 0)),
            $lte: new Date(now.setHours(23, 59, 59, 999)),
          },
        };
        break;
      case 'weekly':
        const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
        weekStart.setHours(0, 0, 0, 0);
        dateFilter = {
          createdOn: {
            $gte: weekStart,
            $lte: new Date(),
          },
        };
        break;
      case 'monthly':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFilter = {
          createdOn: {
            $gte: monthStart,
            $lte: new Date(),
          },
        };
        break;
      case 'yearly':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        dateFilter = {
          createdOn: {
            $gte: yearStart,
            $lte: new Date(),
          },
        };
        break;
      case 'custom':
        if (startDate && endDate) {
          dateFilter = {
            createdOn: {
              $gte: new Date(startDate),
              $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
            },
          };
        }
        break;
      default:
        break;
    }

    const allOrders = await Order.find(dateFilter);
    let chartLabels = [];
    let monthlyData = [];

    if (range === 'yearly' || range === 'custom') {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyTotals = Array(12).fill(0);
      allOrders.forEach(order => {
        const month = order.createdOn.getMonth();
        monthlyTotals[month] += order.finalAmount;
      });
      chartLabels = months;
      monthlyData = monthlyTotals;
    } else if (range === 'monthly') {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dailyTotals = Array(daysInMonth).fill(0);
      const labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);
      allOrders.forEach(order => {
        const day = order.createdOn.getDate() - 1;
        dailyTotals[day] += order.finalAmount;
      });
      chartLabels = labels;
      monthlyData = dailyTotals;
    } else if (range === 'weekly') {
      const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const weeklyTotals = Array(7).fill(0);
      allOrders.forEach(order => {
        const day = order.createdOn.getDay();
        weeklyTotals[day] += order.finalAmount;
      });
      chartLabels = labels;
      monthlyData = weeklyTotals;
    } else if (range === 'daily') {
      const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
      const hourlyTotals = Array(24).fill(0);
      allOrders.forEach(order => {
        const hour = order.createdOn.getHours();
        hourlyTotals[hour] += order.finalAmount;
      });
      chartLabels = labels;
      monthlyData = hourlyTotals;
    }

    res.json({ chartLabels, monthlyData });
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};



module.exports = {
  getAdminOrders,
  getOrderDetails,
  updateOrderItemStatus,
  verifyReturnRequest,
  getSalesReport,
  downloadSalesReport,
  getChartData

};