ARG BASE_IMAGE=browserless/base:1.5.0
FROM $BASE_IMAGE

# Build Args
ARG USE_CHROME_STABLE
ARG PUPPETEER_CHROMIUM_REVISION
ARG PUPPETEER_VERSION
ARG USER=blessuser

# Application parameters and variables
ENV APP_DIR=/usr/src/app
ENV CONNECTION_TIMEOUT=60000
ENV CHROME_PATH=/usr/bin/google-chrome
ENV HOST=0.0.0.0
ENV IS_DOCKER=true
ENV LANG="C.UTF-8"
ENV NODE_ENV=production
ENV PORT=3000
ENV PUPPETEER_CHROMIUM_REVISION=${PUPPETEER_CHROMIUM_REVISION}
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV USE_CHROME_STABLE=${USE_CHROME_STABLE}
ENV WORKSPACE_DIR=$APP_DIR/workspace
ENV USER=${USER}

RUN mkdir -p $APP_DIR $WORKSPACE_DIR

WORKDIR $APP_DIR

# Install app dependencies
COPY package.json .
COPY tsconfig.json .
COPY . .

RUN apt-get -qq update && apt-get -y -qq --no-install-recommends install \
  wget \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libatspi2.0-0 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgdk-pixbuf2.0-0 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libx11-6 \
  libx11-xcb1 \
  libxcb-dri3-0 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  xdg-utils \
  procps && \
  fc-cache -f -v

# Install Chrome Stable when specified
RUN if [ "$USE_CHROME_STABLE" = "true" ]; then \
    cd /tmp &&\
    wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb &&\
    dpkg -i google-chrome-stable_current_amd64.deb;\
  fi

# Build and install external binaries + assets
RUN if [ "$USE_CHROME_STABLE" = "true" ]; then \
    export CHROMEDRIVER_SKIP_DOWNLOAD=false;\
  else \
    export CHROMEDRIVER_SKIP_DOWNLOAD=true;\
  fi &&\
  npm i puppeteer@$PUPPETEER_VERSION;\
  npm run post-install &&\
  npm run build &&\
  chown -R ${USER}:${USER} $APP_DIR

# Run everything after as non-privileged user.
USER ${USER}

# Expose the web-socket and HTTP ports
EXPOSE 3000

CMD ["./start.sh"]
