import type { Worker } from "mediasoup/types";

const getWorker = (workers: Worker[]): Promise<Worker> => {
  return new Promise(async (resolve, reject) => {
    // Only consider LIVE workers — a worker that just died (and is mid-
    // replacement by the self-healing handler in createWorkers) would throw on
    // getResourceUsage and must never be handed out for a new router.
    const liveWorkers = workers.filter((worker) => !worker.closed);
    if (liveWorkers.length === 0) {
      reject(new Error("No workers available"));
      return;
    }

    const workersLoad = liveWorkers.map((worker) =>
      worker
        .getResourceUsage()
        .then((stats) => stats.ru_utime + stats.ru_stime)
        .catch(() => Number.POSITIVE_INFINITY),
    );

    const workersLoadCalc = await Promise.all(workersLoad);

    let leastLoadedWorkerIndex = 0;
    let leastWorkerLoad = workersLoadCalc[0];

    for (let i = 1; i < workersLoadCalc.length; i++) {
      if (workersLoadCalc[i] < leastWorkerLoad) {
        leastLoadedWorkerIndex = i;
        leastWorkerLoad = workersLoadCalc[i];
      }
    }

    resolve(liveWorkers[leastLoadedWorkerIndex]);
  });
};

export default getWorker;
