require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

// Hubungkan ke DB User Bot
mongoose.connect(process.env.MONGO_URI).then(() => console.log('🍃 DB User Bot Terhubung!'));

const User = mongoose.model('User', new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: { type: String, default: '' },
  saldo: { type: Number, default: 0 }
}));

// Tampilan Start (Foto 1)
bot.start(async (ctx) => {
  try {
    let user = await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { username: ctx.from.username || '' },
      { upsert: true, new: true }
    );

    ctx.replyWithMarkdown(
      `👋 *Halo, ${ctx.from.first_name}!*\nSelamat datang di Bot Vulvy OTP.\n\n` +
      `🆔 *ID:* \`${user.telegramId}\`\n` +
      `💰 *Saldo Pengguna:* Rp ${user.saldo.toLocaleString('id-ID')}\n\n` +
      `Silakan gunakan menu tombol di bawah ini untuk bertransaksi.`,
      Markup.keyboard([
        ['🛒 BUY OTP (Nokos)'],
        ['💰 CEK SALDO', '📋 ORDER AKTIF'],
        ['💳 DEPOSIT / TOP UP', '📢 JOIN CHANNEL']
      ]).resize()
    );
  } catch (err) { console.log(err); }
});

// Tombol Pilih Negara (Foto 2)
bot.hears('🛒 BUY OTP (Nokos)', (ctx) => {
  ctx.reply('🌍 *PILIH NEGARA ASAL NOMOR* 🌍', 
    Markup.inlineKeyboard([
      [Markup.button.callback('🇮🇩 Indonesia (++62)', 'go_id'), Markup.button.callback('🇮🇳 India (++91)', 'go_in')],
      [Markup.button.callback('⬅️ Tutup Menu', 'close_menu')]
    ])
  );
});

// Tombol Pilih Aplikasi (Foto 3)
bot.action('go_id', (ctx) => {
  ctx.answerCbQuery();
  ctx.editMessageText('📱 *PILIH LAYANAN / APLIKASI* 📱',
    Markup.inlineKeyboard([
      [Markup.button.callback('🔷 WhatsApp', 'app_wa'), Markup.button.callback('🔷 Telegram', 'app_tele')],
      [Markup.button.callback('⬅️ Ganti Negara', 'back_negara')]
    ])
  );
});

// Tombol Pilih Server & Harga (Foto 4)
bot.action('app_wa', (ctx) => {
  ctx.answerCbQuery();
  ctx.editMessageText('⚙️ *PILIH SERVER / OPERATOR LAYANAN* ⚙️',
    Markup.inlineKeyboard([
      [Markup.button.callback('🛒 WhatsApp - Rp 1.830 (Stok Ready)', 'buy_proses_wa')],
      [Markup.button.callback('⬅️ Kembali', 'go_id')]
    ])
  );
});

// Aksi Eksekusi Pembelian (Mengobrol dengan API server)
bot.action('buy_proses_wa', async (ctx) => {
  const userId = ctx.from.id;
  const harga = 1830;

  try {
    const user = await User.findOne({ telegramId: userId });
    if (!user || user.saldo < harga) return ctx.answerCbQuery('❌ Saldo Anda tidak cukup!', { show_alert: true });

    ctx.answerCbQuery('Sedang mengambil nomor...');

    // BOT MENEMBAK API SERVER (PROSES UTAMA)
    const url = `${process.env.BASE_URL_API}?api_key=${process.env.PROVIDER_API_KEY}&action=getNumber&country=id&service=wa`;
    const res = await axios.get(url);

    if (res.data === 'NO_NUMBERS') return ctx.reply('❌ Stok nomor di gudang sedang habis!');
    if (!res.data.includes('ACCESS_NUMBER')) return ctx.reply('❌ Gagal terhubung ke server provider.');

    // Potong Saldo
    user.saldo -= harga;
    await user.save();

    const [_, orderId, phoneNumber] = res.data.split(':');

    ctx.reply(`✅ *NOMOR BERHASIL DIDAPATKAN!*\n\n📱 Nomor: \`${phoneNumber}\`\n🆔 Order ID: \`${orderId}\`\n\nMenunggu kode OTP masuk...`);

    // Cek OTP Otomatis setiap 5 detik (Looping berkala)
    const checkInterval = setInterval(async () => {
      const statusUrl = `${process.env.BASE_URL_API}?api_key=${process.env.PROVIDER_API_KEY}&action=getStatus&id=${orderId}`;
      const statusRes = await axios.get(statusUrl);

      if (statusRes.data.includes('STATUS_OK')) {
        clearInterval(checkInterval);
        const [_, code] = statusRes.data.split(':');
        
        // Log Sukses Mirip Gambar ke-1 User
        ctx.replyWithMarkdown(
          `🟩 *OTP BERHASIL DITERIMA*\n` +
          `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
          `👤 *User:* ${ctx.from.username || ctx.from.first_name}\n` +
          `🆔 *ID:* \`${userId}\`\n` +
          `📱 *Nomor:* \`${phoneNumber}\`\n` +
          `🔑 *OTP:* \`${code}\`\n` +
          `🌐 *Layanan:* WhatsApp\n` +
          `💵 *Harga:* Rp ${harga}\n` +
          `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`
        );
      }
    }, 5000);

  } catch (err) { ctx.reply('❌ Terjadi gangguan sistem.'); }
});

bot.action('back_negara', (ctx) => { ctx.answerCbQuery(); ctx.editMessageText('🌍 *PILIH NEGARA ASAL NOMOR* 🌍', Markup.inlineKeyboard([[Markup.button.callback('🇮🇩 Indonesia (++62)', 'go_id')]])); });
bot.action('close_menu', (ctx) => { ctx.answerCbQuery(); ctx.deleteMessage(); });

// Fitur Admin Tambah Saldo: /addsaldo [ID] [JUMLAH]
bot.command('addsaldo', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const [_, targetId, nominal] = ctx.message.text.split(' ');
  if (!targetId || !nominal) return ctx.reply('Format: /addsaldo ID NOMINAL');
  
  await User.findOneAndUpdate({ telegramId: targetId }, { $inc: { saldo: parseInt(nominal) } }, { upsert: true });
  ctx.reply(`✅ Sukses tambah saldo ke ${targetId} sebesar Rp ${nominal}`);
});

bot.launch().then(() => console.log('🚀 Bot Telegram Aktif!'));
