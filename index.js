import fetch from "node-fetch";
import { fork } from "child_process";
import { EventEmitter } from "events";
import yaml from "js-yaml";
import { open } from "fs/promises";

import { zkbRequestParams, esiRequestParams } from "./requestParams.js";
import { writeJsonToFile } from "./fileWriter.js";
const baseApiUrl = "https://esi.evetech.net/latest";
const killboardUrl = "https://zkillboard.com";
const gsfId = "1354830081";
const pageLimit = Infinity;
//const pageLimit = 1;
EventEmitter.defaultMaxListeners = 1500;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isIterable(obj) {
  if (obj == null) {
    return false;
  }
  return typeof obj[Symbol.iterator] === "function";
}

let itemDb = null;

async function initItemsDb() {
  console.log("INIT DB");
  let filehandle;
  try {
    filehandle = await open("./sde/fsd/typeIDs.yaml");
    const file = await filehandle.readFile("utf8");

    itemDb = yaml.load(file);
  } catch (e) {
    console.log(e);
  } finally {
    await filehandle?.close();
  }
}

async function getItemInfoFromDump(itemId) {
  return itemDb[itemId];
}

async function getAllyLoses(allyId) {
  let jsonFeed = [];
  let page = 1;

  const fetchPerPage = async (pageNumber) => {
    await delay(1500 * (Math.random() + 1));
    let data = {};
    try {
      const url = `${killboardUrl}/api/losses/allianceID/${allyId}/pastSeconds/604800/page/${pageNumber}/`;
      //const start = Date.now();
      console.log("fetching page" + pageNumber, url);
      const result = await fetch(url, zkbRequestParams);
      //const time = (Date.now() - start) / 1000;
      //console.log(`Result for page ${pageNumber} in ${time}`);
      data = await result.json().catch((error) => {
        console.log(result);
        data = {};
      });
    } catch (error) {
      console.error(error);
    }
    return data;
  };

  const refetch = async () => {
    const result = await fetchPerPage(page);
    if (result.length > 0) {
      jsonFeed = [...jsonFeed, ...result];
      page += 1;
      if (page <= pageLimit) {
        console.log(page);
        await refetch();
      }
    }
  };
  await refetch();
  return jsonFeed;
}

async function getKillmail(killId, killHash, killEtag) {
  if (!killId || !killHash) {
    console.error(
      `Incorrect getkillail input killId: ${killId} killHash: ${killHash}`
    );
    return {};
  }
  const getKm = fork("./getKillmail.js", [killId, killHash, killEtag]);
  const result = await new Promise((resolve, reject) => {
    getKm.on("message", ({ jsonFeed, etag }) => {
      resolve({ jsonFeed, etag });
    });
  });
  return result;
}

function calculateItemsQuantity(items) {
  const result = {};
  items.forEach((element) => {
    if (result[element]) {
      result[element] += 1;
    } else {
      result[element] = 1;
    }
  });
  return result;
}

function sortQuantityData(obj) {
  const sortedResult = Object.keys(obj)
    .map((key) => {
      return { key, losses: obj[key] };
    })
    .sort((fi, se) => se.losses - fi.losses);
  return sortedResult;
}

async function getGoonLoses() {
  const loses = await getAllyLoses(gsfId);
  const killmailIds = loses.map((loss) => {
    return { id: loss.killmail_id, hash: loss.zkb.hash };
  });
  console.log(`Will get ${killmailIds.length} killmails`);
  let killEtag = null;

  let killList = [];
  const limit = 1000;
  const quantity = killmailIds.length;
  let itemsPerCycle = Math.min(limit, quantity);
  let itemsToSkip = 0;
  async function getWithLimit() {
    const query = await Promise.all(
      killmailIds
        .slice(itemsToSkip, itemsToSkip + itemsPerCycle)
        .map(async (killmail, i) => {
          const { jsonFeed, etag } = await getKillmail(
            killmail.id,
            killmail.hash,
            killEtag
          );
          if (killEtag !== etag) {
            killEtag = etag;
          }
          //console.log(`Got killmail ${i} of ${killmailIds.length}`);
          return jsonFeed;
        })
    );
    killList = [...killList, ...query];
    if (killList.length < quantity) {
      itemsToSkip += itemsPerCycle;
      itemsPerCycle = Math.min(limit, Math.max(quantity - itemsToSkip, 0));
      console.log(killList.length, quantity, itemsToSkip, itemsPerCycle);
      await delay(1000);
      await getWithLimit();
    }
  }
  await getWithLimit();

  const shipList = killList.map((kill) => kill?.victim?.ship_type_id);
  const modulesList = killList.map((kill) => kill?.victim?.items);
  return { shipList, modulesList };
}

let itemEtag = null;
async function getItemInfo(itemId) {
  //  const getII = fork("./getItemInfo.js", [itemId, itemEtag]);
  //  const result = await new Promise((resolve, reject) => {
  //    getII.on("message", ({ jsonFeed, etag }) => {
  //      if (itemEtag !== etag) {
  //        itemEtag = etag;
  //      }
  //      resolve({ jsonFeed, etag });
  //    });
  //  });
  const result = await getItemInfoFromDump(itemId);
  return result;
}

async function applyNames(items) {
  console.log(`Apply names to ${items.length} items`);
  const itemsWithNames = await Promise.all(
    items.map(async (item) => {
      const itemData = await getItemInfo(item.key);
      const name = itemData?.name.en;
      return {
        ...item,
        name,
      };
    })
  );
  return itemsWithNames;
}

async function groupModulesByType(modulesList) {
  const unicModules = {};
  if (!isIterable(modulesList)) {
    console.error(`modulesList not isIterable ${modulesList}`);
    return {};
  }
  for (const moduleBatch of modulesList) {
    if (!isIterable(moduleBatch)) {
      console.error(`moduleBatch not isIterable ${moduleBatch}`);
      return {};
    }
    for (const module of moduleBatch) {
      const modulesDropped = module.quantity_dropped
        ? module.quantity_dropped
        : 0;

      const modulesDestroyed = module.quantity_destroyed
        ? module.quantity_destroyed
        : 0;

      const { item_type_id } = module;

      let name = unicModules[item_type_id]?.name?.en;

      if (!name) {
        const itemData = await getItemInfo(item_type_id);
        name = itemData?.name.en;
      }

      unicModules[item_type_id] = {
        item_type_id,
        name,
        quantity_destroyed: unicModules[item_type_id]
          ? unicModules[item_type_id].quantity_destroyed + modulesDestroyed
          : modulesDestroyed,
        quantity_dropped: unicModules[item_type_id]
          ? unicModules[item_type_id].quantity_dropped + modulesDropped
          : modulesDropped,
        positions: unicModules[item_type_id]?.positions
          ? [...unicModules[item_type_id].positions, module.flag]
          : [module.flag],
      };
      unicModules[item_type_id] = {
        ...unicModules[item_type_id],
        totalLossQuantiy:
          unicModules[item_type_id].quantity_dropped +
          unicModules[item_type_id].quantity_destroyed,
        positions: Array.from(new Set(unicModules[item_type_id].positions)),
      };
    }
  }

  const sortedResult = Object.keys(unicModules)
    .map((key) => {
      return { ...unicModules[key] };
    })
    .sort((fi, se) => se.totalLossQuantiy - fi.totalLossQuantiy);
  return sortedResult;
}

async function main() {
  if (!itemDb) {
    await initItemsDb();
  }

  console.log(new Date().toLocaleString());
  const { shipList, modulesList } = await getGoonLoses();
  const lossesQuantity = calculateItemsQuantity(shipList);
  const sortedLosses = sortQuantityData(lossesQuantity);
  const namedLosses = await applyNames(sortedLosses);

  const modulesLosses = await groupModulesByType(modulesList);
  writeJsonToFile(namedLosses, `Ship losses ${Date.now()}`);
  writeJsonToFile(modulesLosses, `Module losses ${Date.now()}`);
}
main();
