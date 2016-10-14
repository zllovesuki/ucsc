FROM mhart/alpine-node:latest

RUN apk add --no-cache git

RUN npm install pm2 -g

RUN mkdir -p /usr/src/app

COPY . /usr/src/app

WORKDIR /usr/src/app

RUN cd $(npm root -g)/npm \
 && npm install fs-extra \
 && sed -i -e s/graceful-fs/fs-extra/ -e s/fs\.rename/fs.move/ ./lib/utils/rename.js

RUN npm install && npm prune --production

EXPOSE 3003

CMD ["pm2", "start", "app.json", "--no-daemon"]
