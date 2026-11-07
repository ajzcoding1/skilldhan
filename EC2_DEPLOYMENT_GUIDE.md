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

> **Download files:** `downloads/` folder को भी server पर रखें। Payment verify होने के बाद app यहीं के PDFs को secure download endpoint से सीधे customer के device पर भेजता है; Google Drive या public file link की जरूरत नहीं है।

---

## 🔑 Step 5: Dependencies और Environment Variables (.env) सेट करें

सर्वर डायरेक्टरी में जाएं:
```bash
cd ~/skilldhan
npm install --production
```

`.env` फाइल बनाएं। Production EC2 server के लिए **Live Mode** credentials ही रखें:
```bash
nano .env
```
फाइल में निम्नलिखित values अपने setup के अनुसार सेट करें:
```env
PORT=3000
NODE_ENV=production
SITE_URL=https://skilldhan.shop

# Razorpay Dashboard के Live Mode से matching keys लें
RAZORPAY_KEY_ID=rzp_live_REPLACE_WITH_YOUR_LIVE_KEY_ID
RAZORPAY_KEY_SECRET=REPLACE_WITH_YOUR_LIVE_KEY_SECRET
ADMIN_SECRET_KEY=PASTE_A_RANDOM_SECRET_HERE

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
SUPPORT_EMAIL=shoppingdebraj@gmail.com
SUPPORT_WHATSAPP=+919876543210
STORE_NAME=Skilldhan
```
`Ctrl + O`, `Enter`, और `Ctrl + X` दबाकर सेव करें।
Secrets को केवल server पर रखें और file permissions सीमित करें:
```bash
chmod 600 .env
```

`ADMIN_SECRET_KEY` में `openssl` से मिला ठीक 64-character hexadecimal output डालें; placeholder या कोई छोटा/अलग format स्वीकार नहीं होगा:
```bash
openssl rand -hex 32
```

Production server Test keys, missing credentials, 64-character hex format से अलग admin secret, invalid INR prices, या missing download files के साथ start नहीं होगा। पहले local या अलग staging environment (`NODE_ENV=development`) में Razorpay **Test Mode** से checkout, captured-payment verification और downloads जांचें। Production पर deploy करने से पहले यहां `NODE_ENV=production` और matching Live credentials रखें; Razorpay में payment capture/auto-capture enable रखें। Secret/key को chat या Git में साझा न करें।

Orders अभी local `orders.json` में store होते हैं। PM2 को एक process पर रखें (ecosystem config में ऐसा सेट है); कई workers/servers चलाने से पहले shared database और shared file storage लगाएं।

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

## 🤖 GitHub Actions से Automatic EC2 Deploy

`.github/workflows/deploy-ec2.yml` में deploy workflow है। `main` branch पर push करने पर यह validate करता है, EC2 पर app files deploy करता है, production dependencies install करता है, PM2 reload करता है, और local health endpoint जांचता है। Checkout/payment secrets और `orders.json` archive में शामिल नहीं होते; EC2 की मौजूदा `.env` और orders file सुरक्षित रहती है। Pull requests पर production deploy नहीं चलता।

यह setup EC2 पर **repository-scoped self-hosted GitHub Actions runner** का इस्तेमाल करता है, इसलिए GitHub-hosted runner के लिए SSH port खोलने की जरूरत नहीं है:

1. GitHub repository में **Settings → Actions → Runners → New self-hosted runner** खोलें और Linux x64 चुनें।
2. EC2 पर `ubuntu` user से दिए गए runner download/configure commands चलाएं। GitHub UI से fresh registration token लें; use के बाद वह expire हो जाता है। Runner को केवल इसी repository से जोड़ें, organization-wide न बनाएं, और service root के बजाय `ubuntu` user के रूप में चलाएं। Configure करते समय `skilldhan-prod` label add करें।
3. Runner service install/start करके status check करें:
   ```bash
   sudo ./svc.sh install ubuntu
   sudo ./svc.sh start
   sudo ./svc.sh status
   ```
4. EC2 पर project `/home/ubuntu/skilldhan` में हो, `.env` root directory में हो और `chmod 600 .env` set हो। `ubuntu` user को project, `.env`, `orders.json`, downloads, और PM2 process का owner रखें।
5. EC2 पर Node.js 20+, npm, PM2 और `curl` installed हों। App को पहली बार manually start करें और PM2 startup (`pm2 startup`, फिर printed command) configure करके `pm2 save` करें।
6. GitHub repository में workflow enable करें। अब `main` पर push या **Actions → Deploy to EC2 → Run workflow** से deploy चलेगा। किसी और production branch का इस्तेमाल हो तो workflow trigger और `github.ref` condition दोनों update करें।

Self-hosted runner trusted repository code चलाता है। Production deployment के लिए `main` पर merge access सिर्फ trusted maintainers को दें, workflow में untrusted pull request triggers न जोड़ें, और runner को root privileges न दें। Workflow failure पर GitHub Actions logs देखें; deploy होने के बाद health check fail हो तो `pm2 status` और `pm2 logs skilldhan` से जांचें।

---

## 🌐 Step 7: Nginx रिवर्स प्रॉक्सी और SSL (HTTPS) सेटअप

ताकि यूज़र्स को पोर्ट 3000 न लिखना पड़े और सीधे `https://skilldhan.shop` खुले:

1. **EC2 के लिए स्थिर public IP रखें।** AWS Console → EC2 → Elastic IPs में Elastic IP allocate करके इस instance से associate करें। सामान्य auto-assigned public IP instance stop/start पर बदल सकती है।
2. अपने domain registrar/DNS provider के DNS management में ये records बनाएं:

   | Type | Name/Host | Value/Points to |
   |---|---|---|
   | A | `@` | EC2 की Elastic IP |
   | A | `www` | EC2 की Elastic IP |

   पुराने conflicting A records हटाएं। अगर आपने IPv6 configure नहीं किया है तो `@`/`www` के पुराने AAAA records भी हटाएं। DNS propagate होने के बाद EC2 पर verify करें:
   ```bash
   curl -4 https://checkip.amazonaws.com
   dig +short A skilldhan.shop
   dig +short A www.skilldhan.shop
   ```
   दोनों `dig` results Elastic IP से match होने चाहिए। AWS Security Group में inbound TCP `80` और `443` public traffic के लिए खुले हों; SSH `22` केवल आपके IP के लिए रखें।

3. Nginx कॉन्फ़िगरेशन बनाएं:
```bash
sudo nano /etc/nginx/sites-available/skilldhan
```

Certificate लेने से पहले केवल ACME challenge को HTTP पर उपलब्ध रखें; बाकी HTTP requests को app तक proxy न करें:
```nginx
server {
    listen 80;
    server_name skilldhan.shop www.skilldhan.shop;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type text/plain;
        try_files $uri =404;
    }

    location / {
        return 404;
    }
}
```

4. साइट सक्रिय करें और Nginx शुरू करें:
```bash
sudo mkdir -p /var/www/certbot/.well-known/acme-challenge
sudo ln -s /etc/nginx/sites-available/skilldhan /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

अगर `nginx -t` सफल है लेकिन Nginx start पर `bind() ... :80 failed (98: Address already in use)` आए, और `sudo ss -ltnp 'sport = :80'` में Nginx process दिखे जबकि `systemctl status nginx` inactive/failed हो, तो एक Nginx instance manually चल रहा है। `nginx -s quit` PID file पर निर्भर है; PID file missing/empty हो तो यह काम नहीं करेगा। `ss` output में master PID पहचानें (या `ps -ef | grep '[n]ginx'` में `master process` वाली line देखें), फिर उसी PID को gracefully quit signal भेजें:
```bash
sudo kill -QUIT <MASTER_PID>
sudo ss -ltnp 'sport = :80'
sudo systemctl reset-failed nginx
sudo systemctl start nginx
sudo systemctl status nginx --no-pager -l
```
`<MASTER_PID>` को अभी दिख रहे master के PID से बदलें; पुराना/दूसरे process का PID इस्तेमाल न करें। Port 80 listener हटने की पुष्टि के बाद ही systemd start करें। `kill -9` न चलाएं।

अगर `could not build server_names_hash` error आए, तो main config खोलें:
```bash
sudo nano /etc/nginx/nginx.conf
```
`http { ... }` block के अंदर, किसी `server {}` block के बाहर यह directive जोड़ें:
```nginx
server_names_hash_bucket_size 128;
```
फिर `sudo nginx -t` सफल होने पर ही `sudo systemctl restart nginx` चलाएं। Nginx inactive हो तो `reload` काम नहीं करेगा।

---

## 🔒 Step 8: मुफ़्त SSL (HTTPS) सर्टिफिकेट लगाएं

Razorpay लाइव पेमेंट्स के लिए HTTPS आवश्यक है। Let's Encrypt से फ्री SSL लगाएं:
```bash
sudo apt install -y certbot
sudo certbot certonly --webroot -w /var/www/certbot -d skilldhan.shop -d www.skilldhan.shop
```
Certificate issue होने के बाद final HTTPS Nginx config लगाएं और reload करें:
```bash
cd ~/skilldhan
sudo cp nginx.conf /etc/nginx/sites-available/skilldhan
sudo nginx -t
sudo systemctl reload nginx
```
Final config HTTP को canonical HTTPS domain पर redirect करता है और app traffic केवल TLS पर proxy करता है। **Certbot चलाने से पहले दोनों DNS records का EC2 की Elastic IP पर resolve होना जरूरी है।** यदि validation fail हो, बार-बार Certbot चलाने से पहले यह जांचें:

1. EC2 की public/Elastic IP और DNS में दोनों domains के A records मिलाएं:
   ```bash
   curl -4 https://checkip.amazonaws.com
   dig +short A skilldhan.shop
   dig +short A www.skilldhan.shop
   ```
   दोनों DNS results इस EC2 की public/Elastic IP पर जाने चाहिए। गलत/stale A records ठीक करें। अगर आपने IPv6 configure नहीं किया है तो DNS से पुराने AAAA records भी हटाएं। DNS change propagate होने तक इंतजार करें। जब तक results match न करें, Certbot **न चलाएं**—ACME challenge गलत server पर जाएगी।
2. AWS Security Group में inbound HTTP (80) और HTTPS (443) खुले होने चाहिए। Initial ACME-only Nginx config test karke service चालू करें, फिर जांचें कि HTTP app को serve नहीं करता:
   ```bash
   sudo nginx -t
   sudo systemctl enable nginx
   sudo systemctl restart nginx
   curl -i -H 'Host: skilldhan.shop' http://127.0.0.1/
   ```
   Landing path पर 404 expected है। Local request पर 500 आए तो पहले app/Nginx logs देखें:
   ```bash
   sudo tail -n 80 /var/log/nginx/error.log
   pm2 logs skilldhan --lines 80
   ```
3. बाहर से दोनों domains की DNS/IP जांचें। Initial config में HTTP पर landing page का `404` expected है; app content केवल certificate लगने के बाद HTTPS से खुलेगा। फिर Certbot दोबारा चलाएं:
   ```bash
   sudo certbot certonly --webroot -w /var/www/certbot -d skilldhan.shop -d www.skilldhan.shop
   ```

अगर Certbot error में दिखाया गया IP EC2 की public/Elastic IP से अलग है, तो पहले DNS ठीक करें—certificate request अभी दूसरे server/IP पर जा रही है।

---

## 💳 Step 9: Razorpay Webhook

इस app में webhook signature वाला अलग webhook endpoint अभी उपलब्ध नहीं है। Razorpay Dashboard में webhook को `/api/verify-payment` पर configure **न करें**—यह route Checkout callback के लिए है। Payment verification app Razorpay API से server-side confirm करता है।

---

## 🎯 टेस्ट और अंतिम जांच
1. पहले confirm करें कि domain का DNS आपके EC2 instance के public IP पर point करता है।
2. ब्राउज़र में `https://skilldhan.shop` खोलें और landing page जांचें।
3. Live launch से पहले local/staging में Razorpay Test Mode checkout और download flow पूरा करें; production domain पर test credentials na डालें।
4. Production पर कम राशि का वास्तविक Live payment करके captured status और PDF download verify करें; जरूरत हो तो Razorpay Dashboard से refund करें।
5. सर्वर पर app status/logs जांचें:
   ```bash
   pm2 status
   pm2 logs skilldhan --lines 100
   ```
6. `.env` और orders data का सुरक्षित backup रखें; `orders.json` को public repository में commit न करें।

🎉 **Deployment पूरा होने के बाद आपका डिजिटल स्टोर HTTPS के जरिए उपलब्ध होगा।**
