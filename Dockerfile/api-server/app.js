require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SECRET_API_KEY = process.env.SECRET_API_KEY;

// Koneksi Database Gudang Nomor
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🍃 Database Gudang OTP (API) Terhubung!'))
  .catch(err => console.error('❌ Gagal konek DB Gudang:', err));

// Schema Stok Nomor Fisik
const NumberStock = mongoose.model('NumberStock', new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true },
  countryCode: { type: String, default: 'id' }, 
  status: { type: String, enum: ['READY', 'USED'], default: 'READY' }
}));

// Schema Log Transaksi SMS / OTP
const OrderOtp = mongoose.model('OrderOtp', new mongoose.Schema({
  orderId: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  serviceCode: { type: String, required: true },
  otpCode: { type: String, default: '' },
  status: { type: String, enum: ['WAITING', 'COMPLETED', 'CANCELLED'], default: 'WAITING' },
  createdAt: { type: Date, default: Date.now }
}));

// Middleware Cek API Key
const validateApiKey = (req, res, next) => {
  if (req.query.api_key !== SECRET_API_KEY) return res.send('BAD_KEY');
  next();
};

// Endpoints API
app.get('/steward.php', validateApiKey, async (req, res) => {
  const { action, country, service, id } = req.query;

  if (action === 'getBalance') {
    return res.send('ACCESS_BALANCE:5000000'); // Simulasi saldo hulu Rp 5jt
  }

  if (action === 'getNumber') {
    try {
      const number = await NumberStock.findOne({ status: 'READY', countryCode: country });
      if (!number) return res.send('NO_NUMBERS');

      number.status = 'USED';
      await number.save();

      const orderId = Math.floor(100000 + Math.random() * 900000).toString();
      await new OrderOtp({ orderId, phoneNumber: number.phoneNumber, serviceCode: service }).save();

      return res.send(`ACCESS_NUMBER:${orderId}:${number.phoneNumber}`);
    } catch (err) { return res.send('ERROR_SERVER'); }
  }

  if (action === 'getStatus') {
    try {
      const order = await OrderOtp.findOne({ orderId: id });
      if (!order) return res.send('NO_ACTIVATION');
      if (order.otpCode !== '') return res.send(`STATUS_OK:${order.otpCode}`);
      return res.send('STATUS_WAIT_CODE');
    } catch (err) { return res.send('ERROR_SERVER'); }
  }
});

// Endpoint suntik stok nomor & SMS masuk (Simulasi)
app.get('/add-stok', async (req, res) => {
  const nomor = '62838' + Math.floor(10000000 + Math.random() * 90000000);
  await new NumberStock({ phoneNumber: nomor, countryCode: 'id' }).save();
  res.send(`Sukses tambah nomor: ${nomor}`);
});

app.get('/terima-sms', async (req, res) => {
  const { orderId, code } = req.query;
  await OrderOtp.findOneAndUpdate({ orderId }, { otpCode: code, status: 'COMPLETED' });
  res.send(`SMS Masuk! OTP ${code} disuntik ke Order ID ${orderId}`);
});

app.listen(PORT, () => console.log(`🔌 Server API Aktif di: http://localhost:${PORT}`));
