#!/usr/bin/env node
const child = require('child_process');
const util = require('util');
const debug = require('debug')('browserless-docker-deploy');
const exec = util.promisify(child.exec);
const { map, noop, min } = require('lodash');
const path = require('path');
const fs = require('fs-extra');

const {
  releaseVersions,
  puppeteerVersions,
  version,
} = require('../package.json');

const REPO = process.env.REPO || 'browserless/chrome';
const TAG_NAME = process.env.TAG_NAME;
const BASE_IMAGE = process.env.BASE_IMAGE;
const USER = process.env.USER || 'blessuser';

const logExec = (cmd) => {
  debug(`  "${cmd}"`);
  return exec(cmd).then(({ stdout, stderr }) => {
    if (stderr.trim().length > 0) {
      console.warn(stderr.slice(-500));
    }
    return stdout.trim();
  });
};

async function cleanup () {
  await logExec(`git reset origin/master --hard`);
  await logExec(`rm -rf node_modules`);
}

// version is the full tag (1.2.3-puppeteer-1.11.1)
// pptrVersion is one of the versions in packageJson.releaseVersions
const deployVersion = async (tags, pptrVersion) => {
  const versionInfo = puppeteerVersions[pptrVersion];
  const puppeteerVersion = versionInfo.puppeteer;
  const puppeteerChromiumRevision = versionInfo.chromeRevision;

  const [ patchBranch, minorBranch, majorBranch ] = tags;
  const isChromeStable = majorBranch.includes('chrome-stable');

  debug(`Beginning docker build and publish of tag ${patchBranch} ${minorBranch} ${majorBranch}`);

  await logExec(`PUPPETEER_CHROMIUM_REVISION=${puppeteerChromiumRevision} \
    ${isChromeStable ? 'USE_CHROME_STABLE=true CHROMEDRIVER_SKIP_DOWNLOAD=false PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true' : ''} \
    npm install --silent --save --save-exact puppeteer@${puppeteerVersion}
  `);

  await logExec(`PUPPETEER_CHROMIUM_REVISION=${puppeteerChromiumRevision} \
    ${isChromeStable ? 'USE_CHROME_STABLE=true CHROMEDRIVER_SKIP_DOWNLOAD=false PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true' : ''} \
    npm run post-install
  `);

  const versionJson = fs.readJSONSync(path.join(__dirname, '..', 'version.json'));
  const chromeStableArg = isChromeStable ? 'true' : 'false';

  let dockerTags = [];
  if (TAG_NAME) {
    dockerTags.push(`${REPO}/${TAG_NAME}`)
  } else {
    [patchBranch, minorBranch, majorBranch].forEach(tag => dockerTags.push(`${REPO}/${tag}`));
  }

  // docker build
  await logExec(`docker build \
  --quiet \
  --build-arg "PUPPETEER_CHROMIUM_REVISION=${puppeteerChromiumRevision}" \
  --build-arg "USE_CHROME_STABLE=${chromeStableArg}" \
  --build-arg "PUPPETEER_VERSION=${puppeteerVersion}" \
  --build-arg "BASE_IMAGE=${BASE_IMAGE}" \
  --build-arg "USER=${USER}" \
  --label "browser=${versionJson.Browser}" \
  --label "protocolVersion=${versionJson['Protocol-Version']}" \
  --label "v8Version=${versionJson['V8-Version']}" \
  --label "webkitVersion=${versionJson['WebKit-Version']}" \
  --label "debuggerVersion=${versionJson['Debugger-Version']}" \
  --label "puppeteerVersion=${versionJson['Puppeteer-Version']}" \
  ${dockerTags.map(tag => `-t ${tag}`).join(' ')} \
  .`);

  if (TAG_NAME) {
    // await logExec(`docker push ${REPO}:${TAG_NAME}`)
  } else {
    // docker push
    await Promise.all([
      logExec(`docker push ${REPO}:${patchBranch}`),
      logExec(`docker push ${REPO}:${minorBranch}`),
      logExec(`docker push ${REPO}:${majorBranch}`),
    ]);

    await logExec(`git add --force version.json hosts.json hints.json protocol.json`).catch(noop);
    await logExec(`git commit --quiet -m "DEPLOY.js committing files for tag ${patchBranch}"`).catch(noop);
    await logExec(`git tag --force ${patchBranch}`);
    await logExec(`git push origin ${patchBranch} --force --quiet --no-verify &> /dev/null`).catch(noop);  
    
    // git reset for next update
    await cleanup();
  }

}

async function deploy () {
  const versions = map(releaseVersions, (pptrVersion) => {
    const [ major, minor, patch ] = version.split('.');

    const patchBranch = `${major}.${minor}.${patch}-${pptrVersion}`;
    const minorBranch = `${major}.${minor}-${pptrVersion}`;
    const majorBranch = `${major}-${pptrVersion}`;

    return {
      tags: [ patchBranch, minorBranch, majorBranch ],
      pptrVersion,
    };
  });

  await versions.reduce(
    (lastJob, { tags, pptrVersion }) =>
      lastJob
        .then(() => {
          if (!process.env.SINGLE_VERSION || process.env.SINGLE_VERSION === pptrVersion) {
            return deployVersion(tags, pptrVersion);
          }
        })
        .catch((error) => {
          console.log(`Error in build (${version}): `, error);
          process.exit(1);
        }),
    Promise.resolve()
  );

  // await logExec(`docker images -a | grep "${REPO}" | awk '{print $3}' | xargs docker rmi -f`);
  debug(`Complete! Cleaning up file-system and exiting.`);
}

deploy();
