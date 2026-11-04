# 🚀 AWS EC2 पर Digital Store और Razorpay डिप्लॉयमेंट गाइड

इस गाइड में आपको अपने **"AI की मदद से अपना पहला डिजिटल बिज़नेस"** लैंडिंग पेज और चेकआउट सिस्टम को **AWS EC2 सर्वर** पर 24/7 लाइव चलाने का पूरा तरीका आसान भाषा में समझाया गया है।

---

## 📋 पूर्व-आवश्यकताएं (Prerequisites)
1. एक सक्रिय **AWS Account** (EC2 के लिए)
2. एक सक्रिय **Razorpay Account** (UPI और कार्ड पेमेंट स्वीकार करने के लिए: [Razorpay Dashboard](https://dashboard.razorpay.com))
3. आपका डोमेन: `skilldhan.shop`
4. प्रोजेक्ट का Git repository URL या आपके कंप्यूटर पर उसकी local copy

> **शुरू करने से पहले:** AWS और Razorpay की pricing/eligibility account और region के अनुसार बदल सकती है। EC2 बनाते समय current pricing ज़रूर जांचें। `.env` में live secrets डालें और उन्हें किसी के साथ share या Git में commit न करें।

### इस गाइड में
- [EC2 instance और network](#step-1-aws-ec2-instance-बनाएं)
- [सर्वर तैयार करें](#step-2-ec2-सर्वर-में-लॉगिन-करें)
- [प्रोजेक्ट और environment सेट करें](#step-4-प्रोजेक्ट-फाइल्स-को-ec2-पर-अपलोड-करें)
- [ऐप, domain और HTTPS चालू करें](#step-6-pm2-के-साथ-ऐप-को-बैकग्राउंड-में-चलाएं)
- [Webhook और अंतिम जांच](#step-9-razorpay-में-webhook-सेटअप-वैकल्पिक-परंतु-उत्तम)

---

## 🛠️ Step 1: AWS EC2 Instance बनाएं

1. AWS Console में जाएं और **EC2** सर्च करें।
2. **"Launch Instance"** पर क्लिक करें:
   - **Name:** `ai-digital-store`
   - **OS Image:** `Ubuntu Server 24.04 LTS` (या `22.04 LTS`) - 64-bit (x86)
   - **Instance Type:** अपने workload और AWS pricing के अनुसार चुनें। Free Tier/credits की eligibility account और region पर निर्भर करती है।
   - **Key pair:** नया key pair बनाकर `.pem` file सुरक्षित download करें (SSH login के लिए)।
3. **Network Settings (Security Group):**
   केवल ये inbound ports खोलें:
   - **SSH (Port 22)** - केवल **My IP**; इसे `Anywhere` पर न खोलें।
   - **HTTP (Port 80)** - Anywhere (0.0.0.0/0)
   - **HTTPS (Port 443)** - Anywhere (0.0.0.0/0)
   
   > **Port 3000 को public न करें।** App को Nginx के जरिए `127.0.0.1:3000` पर access किया जाएगा।
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
git clone <YOUR_GIT_REPO_URL> ~/skilldhan
cd ~/skilldhan
```

### विकल्प B: SCP द्वारा अपने कंप्यूटर से सीधे भेजें
अपने स्थानीय कंप्यूटर (Windows) पर project के parent folder से चलाएं। `skilldhan-main` को अपने project folder के नाम से बदलें:
```powershell
scp -i "your-key.pem" -r .\skilldhan-main ubuntu@YOUR_EC2_PUBLIC_IP:/home/ubuntu/skilldhan
```

---

## 🔑 Step 5: Dependencies और Environment Variables (.env) सेट करें

सर्वर डायरेक्टरी में जाएं:
```bash
cd ~/skilldhan
npm install --production
```

`.env` फाइल बनाएं। पहले Razorpay Dashboard में **Test Mode** की API keys लें और उन्हीं से payment flow जांचें:
```bash
nano .env
```
फाइल में निम्नलिखित values अपने setup के अनुसार सेट करें:
```env
PORT=3000
NODE_ENV=production
SITE_URL=https://skilldhan.shop

# पहले Test Mode keys से जांचें; सफल परीक्षण के बाद ही Live Mode keys डालें
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxxxx
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
SUPPORT_EMAIL=support@skilldhan.shop
SUPPORT_WHATSAPP=+919876543210
STORE_NAME=Skilldhan
```
`Ctrl + O`, `Enter`, और `Ctrl + X` दबाकर सेव करें।
Secrets को केवल server पर रखें और file permissions सीमित करें:
```bash
chmod 600 .env
```

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
pm2 logs skilldhan
```

---

## 🌐 Step 7: Nginx रिवर्स प्रॉक्सी और SSL (HTTPS) सेटअप

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
sudo ln -s /etc/nginx/sites-available/skilldhan /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 🔒 Step 8: मुफ़्त SSL (HTTPS) सर्टिफिकेट लगाएं

Razorpay लाइव पेमेंट्स के लिए HTTPS आवश्यक है। Let's Encrypt से फ्री SSL लगाएं:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d skilldhan.shop -d www.skilldhan.shop
```
प्रॉम्प्ट का उत्तर दें - Certbot स्वतः ही Nginx में HTTPS कॉन्फ़िगर कर देगा।

---

## 💳 Step 9: Razorpay में Webhook सेटअप (वैकल्पिक परंतु उत्तम)

1. [Razorpay Dashboard](https://dashboard.razorpay.com) -> **Settings** -> **Webhooks** में जाएं।
2. **"Add New Webhook"** पर क्लिक करें:
   - **URL:** `https://skilldhan.shop/api/verify-payment`
   - **Events:** `payment.captured`, `order.paid`
3. सेव करें।

---

## 🎯 टेस्ट और अंतिम जांच
1. पहले confirm करें कि domain का DNS आपके EC2 instance के public IP पर point करता है।
2. ब्राउज़र में `https://skilldhan.shop` खोलें और landing page जांचें।
3. Razorpay test mode में checkout और payment verification flow पूरा करें; live payment से पहले test credentials इस्तेमाल करें।
4. Payment के बाद confirmation page पर download links जांचें। सभी checks सफल होने पर ही `.env` में `rzp_live_...` और Live Mode secret डालें।
5. सर्वर पर app status/logs जांचें:
   ```bash
   pm2 status
   pm2 logs skilldhan --lines 100
   ```
6. `.env` और orders data का सुरक्षित backup रखें; `orders.json` को public repository में commit न करें।

🎉 **Deployment पूरा होने के बाद आपका डिजिटल स्टोर HTTPS के जरिए उपलब्ध होगा।**
