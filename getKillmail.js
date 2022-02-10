import fetch from "node-fetch";

import { esiRequestParams } from "./requestParams.js";

const baseApiUrl = "https://esi.evetech.net/latest";
async function getKillmail(killId, killHash, killEtag) {
  const url = `${baseApiUrl}/killmails/${killId}/${killHash}`;
  const start = Date.now();
  esiRequestParams.headers = {
    path: `/latest/killmails/${killId}/${killHash}/?datasource=tranquility`,
    "If-None-Match": killEtag,
    ...esiRequestParams.headers,
  };
  const result = await fetch(url, esiRequestParams);

  const { etag } = result.headers;
  const jsonFeed = await result.json().catch((error) => {
    console.error(result, error);
    jsonFeed = {};
  });

  const time = (Date.now() - start) / 1000;
  console.log(`Ready killmail ${killId} in ${time}`);
  return { jsonFeed, etag };
}

async function get() {
  const { jsonFeed, etag } = await getKillmail(
    process.argv[2],
    process.argv[3],
    process.argv[4]
  );
  process.send({ jsonFeed, etag });
}
get();
