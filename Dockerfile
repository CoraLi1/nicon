FROM node:14.18.1

RUN mkdir -p /home/icontest
WORKDIR /home/icontest

COPY . /home/icontest

RUN npm install

EXPOSE 4348

ENTRYPOINT ['npm', 'run']

CMD ["publish"]
