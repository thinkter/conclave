import type { Worker } from "mediasoup/types";

const getWorker = async (workers: Worker[]): Promise<Worker> => {
  // Only consider live workers. A worker that just died and is mid-replacement
  // would throw on getResourceUsage and must not receive a new router.
  const liveWorkers = workers.filter((worker) => !worker.closed);
  if (liveWorkers.length === 0) {
    throw new Error("No workers available");
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

  return liveWorkers[leastLoadedWorkerIndex];
};

export default getWorker;
