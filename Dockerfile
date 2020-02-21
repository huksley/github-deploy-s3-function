FROM node:12
RUN mkdir /tmp/run
WORKDIR /tmp/run
COPY package.json .
COPY *.yml ./
COPY yarn.lock ./
RUN yarn
ENV HOME=/tmp/home
COPY *.js ./
COPY .env ./
RUN yarn deploy

