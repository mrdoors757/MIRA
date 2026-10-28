#!/usr/bin/env bash
# Запускать на сервере (Ubuntu/Debian) от root, из папки с распакованным проектом:  sudo bash deploy/setup.sh
set -euo pipefail
APP=/var/www/mira

apt-get update
apt-get install -y nginx curl unzip
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; apt-get install -y nodejs; }

id mira &>/dev/null || useradd --system --home $APP --shell /usr/sbin/nologin mira
mkdir -p $APP
# не перетираем data/ и uploads/ при повторном деплое
rsync -a --exclude node_modules --exclude data --exclude uploads ./ $APP/
mkdir -p $APP/data $APP/uploads
[ -f $APP/data/db.json ] || cp data/db.json $APP/data/db.json
cd $APP && npm install --omit=dev
chown -R mira:mira $APP

[ -f /etc/mira.env ] || { echo "SESSION_SECRET=$(openssl rand -hex 32)" > /etc/mira.env; chmod 600 /etc/mira.env; }

cp deploy/mira.service /etc/systemd/system/mira.service 2>/dev/null || cp $APP/deploy/mira.service /etc/systemd/system/mira.service
systemctl daemon-reload && systemctl enable --now mira && systemctl restart mira

cp $APP/deploy/nginx-mira.conf /etc/nginx/sites-available/mira
ln -sf /etc/nginx/sites-available/mira /etc/nginx/sites-enabled/mira
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "Готово. Осталось: поменять server_name в /etc/nginx/sites-available/mira и выпустить HTTPS: certbot --nginx -d ДОМЕН"
