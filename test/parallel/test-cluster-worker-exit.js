'use strict';
// test-cluster-worker-exit.js
// verifies that, when a child process exits (by calling `process.exit(code)`)
// - the parent receives the proper events in the proper order, no duplicates
// - the exitCode and signalCode are correct in the 'exit' event
// - the worker.exitedAfterDisconnect flag, and worker.state are correct
// - the worker process actually goes away

const common = require('../common');
const assert = require('assert');
const cluster = require('cluster');

const EXIT_CODE = 42;

if (cluster.isWorker) {
  const http = require('http');
  const server = http.Server(() => { });

  server.once('listening', common.mustCall(() => {
    process.exit(EXIT_CODE);
  }));
  server.listen(common.PORT, '127.0.0.1');

} else if (cluster.isMaster) {

  const expected_results = {
    cluster_emitDisconnect: [1, "the cluster did not emit 'disconnect'"],
    cluster_emitExit: [1, "the cluster did not emit 'exit'"],
    cluster_exitCode: [EXIT_CODE, 'the cluster exited w/ incorrect exitCode'],
    cluster_signalCode: [null, 'the cluster exited w/ incorrect signalCode'],
    worker_emitDisconnect: [1, "the worker did not emit 'disconnect'"],
    worker_emitExit: [1, "the worker did not emit 'exit'"],
    worker_state: ['disconnected', 'the worker state is incorrect'],
    worker_suicideMode: [false, 'the worker.suicide flag is incorrect'],
    worker_exitedAfterDisconnect: [
      false, 'the .exitedAfterDisconnect flag is incorrect'
    ],
    worker_died: [true, 'the worker is still running'],
    worker_exitCode: [EXIT_CODE, 'the worker exited w/ incorrect exitCode'],
    worker_signalCode: [null, 'the worker exited w/ incorrect signalCode']
  };
  const results = {
    cluster_emitDisconnect: 0,
    cluster_emitExit: 0,
    worker_emitDisconnect: 0,
    worker_emitExit: 0
  };


  // start worker
  const worker = cluster.fork();

  // Check cluster events
  cluster.on('disconnect', common.mustCall(() => {
    results.cluster_emitDisconnect += 1;
  }));
  cluster.on('exit', common.mustCall((worker) => {
    results.cluster_exitCode = worker.process.exitCode;
    results.cluster_signalCode = worker.process.signalCode;
    results.cluster_emitExit += 1;
  }));

  // Check worker events and properties
  worker.on('disconnect', common.mustCall(() => {
    results.worker_emitDisconnect += 1;
    results.worker_suicideMode = worker.suicide;
    results.worker_exitedAfterDisconnect = worker.exitedAfterDisconnect;
    results.worker_state = worker.state;
    if (results.worker_emitExit > 0) {
      process.nextTick(() => finish_test());
    }
  }));

  // Check that the worker died
  worker.once('exit', common.mustCall((exitCode, signalCode) => {
    results.worker_exitCode = exitCode;
    results.worker_signalCode = signalCode;
    results.worker_emitExit += 1;
    results.worker_died = !common.isAlive(worker.process.pid);
    if (results.worker_emitDisconnect > 0) {
      process.nextTick(() => finish_test());
    }
  }));

  const finish_test = function() {
    try {
      checkResults(expected_results, results);
    } catch (exc) {
      if (exc.name !== 'AssertionError') {
        console.trace(exc);
      }

      process.exit(1);
      return;
    }
    process.exit(0);
  };
}

// some helper functions ...

function checkResults(expected_results, results) {
  for (const k in expected_results) {
    const actual = results[k];
    const expected = expected_results[k];

    assert.strictEqual(actual,
                       expected && expected.length ? expected[0] : expected,
                       (expected[1] || '') +
                         ` [expected: ${expected[0]} / actual: ${actual}]`);
  }
}
