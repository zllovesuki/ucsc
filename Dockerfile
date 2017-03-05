FROM mhart/alpine-node:latest

RUN apk add --no-cache git

RUN npm install pm2 -g

RUN cd $(npm root -g)/npm \
 && npm install fs-extra \
 && sed -i -e s/graceful-fs/fs-extra/ -e s/fs\.rename/fs.move/ ./lib/utils/rename.js

ADD package.json /tmp/package.json
RUN cd /tmp && npm install
RUN mkdir -p /usr/src/app && cp -a /tmp/node_modules /usr/src/app/

WORKDIR /usr/src/app

COPY . /usr/src/app

EXPOSE 2009

CMD ["pm2", "start", "server.json", "--no-daemon"]
