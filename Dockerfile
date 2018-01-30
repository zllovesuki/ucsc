FROM mhart/alpine-node:8.9.1

RUN apk add --no-cache git poppler-utils

RUN npm install pm2 -g

ADD package-lock.json package.json /tmp/
RUN cd /tmp && npm install
RUN mkdir -p /usr/src/app && cp -a /tmp/node_modules /usr/src/app/

WORKDIR /usr/src/app

COPY . /usr/src/app

EXPOSE 2009
