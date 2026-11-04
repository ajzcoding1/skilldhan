# 🚀 AWS EC2 पर Digital Store और Razorpay डिप्लॉयमेंट गाइड

इस गाइड में आपको अपने **"AI की मदद से अपना पहला डिजिटल बिज़नेस"** लैंडिंग पेज और चेकआउट सिस्टम को **AWS EC2 सर्वर** पर 24/7 लाइव चलाने का पूरा तरीका आसान भाषा में समझाया गया है।

---

## 📋 पूर्व-आवश्यकताएं (Prerequisites)
1. एक सक्रिय **AWS Account** (EC2 के लिए)
2. एक सक्रिय **Razorpay Account** (UPI और कार्ड पेमेंट स्वीकार करने के लिए: [Razorpay Dashboard](https://dashboard.razorpay.com))
<<<<<<< HEAD
3. आपका डोमेन: `skilldhan.shop`
=======
3. एक कस्टम डोमेन (वैकल्पिक, जैसे: `mydigitalstore.com`)
>>>>>>> origin/main

---

## 🛠️ Step 1: AWS EC2 Instance बनाएं

1. AWS Console में जाएं और **EC2** सर्च करें।
2. **"Launch Instance"** पर क्लिक करें:
   - **Name:** `ai-digital-store`
   - **OS Image:** `Ubuntu Server 24.04 LTS` (या `22.04 LTS`) - 64-bit (x86)
   - **Instance Type:** `t3.micro` या `t2.micro` (AWS Free Tier में मुफ़्त)
   - **Key pair:** अपनी `.pem` की डाउनलोड करें (SSH लॉगिन के लिए)
3. **Network Settings (Security Group):**
   निम्न पोर्ट्स खोलें (Inbound Rules):
   - **SSH (Port 22)** - Anywhere (या आपका IP)
   - **HTTP (Port 80)** - Anywhere (0.0.0.0/0)
   - **HTTPS (Port 443)** - Anywhere (0.0.0.0/0)
   - **Custom TCP (Port 3000)** - Anywhere (0.0.0.0/0) - *वैकल्पिक परीक्षण के लिए*
4. **"Launch Instance"** पर क्लिक करें।

---

## 💻 Step 2: EC2 सर्वर में लॉगिन करें

अपने कंप्यूटर के टर्मिनल या Command Prompt से:
```bash
ssh -i "your-key.pem" ubuntu@YOUR_EC2_PUBLIC_IP
```

---

## ⚙️ Step 3: Node.js, Nginx और PM2 इनस्टॉल करें

EC2 टर्मिनल में यह कमांड्स एक-एक करके चलाएं:

```bash
# 1. सिस्टम अपडेट करें
sudo apt update && sudo apt upgrade -y

# 2. Node.js v20/v22 LTS इनस्टॉल करें
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx

# 3. PM2 (Process Manager) इनस्टॉल करें (सर्वर को 24/7 चालू रखने के लिए)
sudo npm install -g pm2
```

सत्यापित करें:
```bash
node -v
npm -v
pm2 -v
```

---

## 📂 Step 4: प्रोजेक्ट फाइल्स को EC2 पर अपलोड करें

### विकल्प A: Git द्वारा (अनुशंसित)
```bash
cd /var/www
<<<<<<< HEAD
sudo git clone <YOUR_GIT_REPO_URL> skilldhan
sudo chown -R ubuntu:ubuntu skilldhan
cd skilldhan
=======
sudo git clone <YOUR_GIT_REPO_URL> mydigitalstore
sudo chown -R ubuntu:ubuntu mydigitalstore
cd mydigitalstore
>>>>>>> origin/main
```

### विकल्प B: SCP द्वारा अपने कंप्यूटर से सीधे भेजें
अपने स्थानीय कंप्यूटर (Windows) से:
```powershell
<<<<<<< HEAD
scp -i "your-key.pem" -r c:\Users\lamga\Desktop\skilldhan-main\skilldhan-main ubuntu@YOUR_EC2_PUBLIC_IP:/home/ubuntu/skilldhan
=======
scp -i "your-key.pem" -r c:\Users\lamga\Desktop\mydigitalstore ubuntu@YOUR_EC2_PUBLIC_IP:/home/ubuntu/
>>>>>>> origin/main
```

---

## 🔑 Step 5: Dependencies और Environment Variables (.env) सेट करें

सर्वर डायरेक्टरी में जाएं:
```bash
<<<<<<< HEAD
cd /home/ubuntu/skilldhan   # या /var/www/skilldhan
=======
cd /home/ubuntu/mydigitalstore   # या /var/www/mydigitalstore
>>>>>>> origin/main
npm install --production
```

`.env` फाइल बनाएं और अपनी असली **Razorpay API Keys** डालें:
```bash
nano .env
```
फाइल में निम्नलिखित सेट करें:
```env
PORT=3000
NODE_ENV=production
<<<<<<< HEAD
SITE_URL=https://skilldhan.shop
=======
>>>>>>> origin/main

# Razorpay Keys (Razorpay Dashboard -> Settings -> API Keys से प्राप्त करें)
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx

# Product Pricing
PRODUCT_NAME=AI की मदद से अपना पहला डिजिटल बिज़नेस (eBook + Bonuses)
PRODUCT_PRICE=199
PRODUCT_CURRENCY=INR
PRODUCT_MRP=999

# Order Bump
ORDER_BUMP_ENABLED=true
ORDER_BUMP_TITLE=🔥 Exclusive AI Prompt Vault (500+ Master Prompts)
ORDER_BUMP_PRICE=99

# Support details
<<<<<<< HEAD
SUPPORT_EMAIL=support@skilldhan.shop
SUPPORT_WHATSAPP=+919876543210
STORE_NAME=Skilldhan
=======
SUPPORT_EMAIL=support@yourdomain.com
SUPPORT_WHATSAPP=+919876543210
STORE_NAME=DigitalGuru AI
>>>>>>> origin/main
```
`Ctrl + O`, `Enter`, और `Ctrl + X` दबाकर सेव करें।

---

## 🚀 Step 6: PM2 के साथ ऐप को बैकग्राउंड में चलाएं

```bash
# PM2 से सर्वर स्टार्ट करें
pm2 start ecosystem.config.js --env production

# सर्वर रीबूट होने पर भी अपने आप चालू रखने के लिए
pm2 save
pm2 startup
# (जो कमांड टर्मिनल स्क्रीन पर दिखाए, उसे कॉपी करके चलाएं)
```

अब आपका नोड सर्वर बैकग्राउंड में पोर्ट `3000` पर 24/7 चालू रहेगा!
स्थिति जांचने के लिए:
```bash
pm2 status
<<<<<<< HEAD
pm2 logs skilldhan
=======
pm2 logs mydigitalstore
>>>>>>> origin/main
```

---

## 🌐 Step 7: Nginx रिवर्स प्रॉक्सी और SSL (HTTPS) सेटअप

<<<<<<< HEAD
ताकि यूज़र्स को पोर्ट 3000 न लिखना पड़े और सीधे `https://skilldhan.shop` खुले:

1. Nginx कॉन्फ़िगरेशन बनाएं:
```bash
sudo nano /etc/nginx/sites-available/skilldhan
```

निम्न कोड पेस्ट करें:
```nginx
server {
    listen 80;
    server_name skilldhan.shop www.skilldhan.shop;
=======
ताकि यूज़र्स को पोर्ट 3000 न लिखना पड़े और सीधे `http://YOUR_DOMAIN` खुले:

1. Nginx कॉन्फ़िगरेशन बनाएं:
```bash
sudo nano /etc/nginx/sites-available/mydigitalstore
```

निम्न कोड पेस्ट करें (अपना डोमेन या EC2 Public IP डालें):
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com; # या EC2 Public IP
>>>>>>> origin/main

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    client_max_body_size 25M;
}
```

2. साइट सक्रिय करें और Nginx रीस्टार्ट करें:
```bash
<<<<<<< HEAD
sudo ln -s /etc/nginx/sites-available/skilldhan /etc/nginx/sites-enabled/
=======
sudo ln -s /etc/nginx/sites-available/mydigitalstore /etc/nginx/sites-enabled/
>>>>>>> origin/main
sudo nginx -t
sudo systemctl restart nginx
```

---

## 🔒 Step 8: मुफ़्त SSL (HTTPS) सर्टिफिकेट लगाएं

Razorpay लाइव पेमेंट्स के लिए HTTPS आवश्यक है। Let's Encrypt से फ्री SSL लगाएं:
```bash
sudo apt install -y certbot python3-certbot-nginx
<<<<<<< HEAD
sudo certbot --nginx -d skilldhan.shop -d www.skilldhan.shop
=======
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
>>>>>>> origin/main
```
प्रॉम्प्ट का उत्तर दें - Certbot स्वतः ही Nginx में HTTPS कॉन्फ़िगर कर देगा।

---

## 💳 Step 9: Razorpay में Webhook सेटअप (वैकल्पिक परंतु उत्तम)

1. [Razorpay Dashboard](https://dashboard.razorpay.com) -> **Settings** -> **Webhooks** में जाएं।
2. **"Add New Webhook"** पर क्लिक करें:
<<<<<<< HEAD
   - **URL:** `https://skilldhan.shop/api/verify-payment`
=======
   - **URL:** `https://yourdomain.com/api/verify-payment`
>>>>>>> origin/main
   - **Events:** `payment.captured`, `order.paid`
3. सेव करें।

---

## 🎯 टेस्ट और परीक्षण कैसे करें?
<<<<<<< HEAD
1. ब्राउज़र में `https://skilldhan.shop` खोलें - आपका शानदार हिंदी लैंडिंग पेज लोड होगा।
=======
1. ब्राउज़र में `https://yourdomain.com` खोलें - आपका शानदार हिंदी लैंडिंग पेज लोड होगा।
>>>>>>> origin/main
2. **"अभी खरीदें - ₹199"** पर क्लिक करें - चेकआउट पेज खुलेगा।
3. नाम, ईमेल और व्हाट्सएप नंबर दर्ज करें और पे बटन दबाएं।
4. भुगतान पूरा होते ही तुरंत `/success` पेज पर **"ई-बुक डाउनलोड करें (PDF)"** बटन आ जाएगा।
5. ऑर्डर विवरण सर्वर पर `orders.json` फाइल में स्वतः सुरक्षित हो जाता है।

🎉 **बधाई! आपका डिजिटल बिज़नेस स्टोर AWS EC2 पर पूरी तरह तैयार है!**
