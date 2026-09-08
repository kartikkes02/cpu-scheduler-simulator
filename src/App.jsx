import React, { useState, useMemo } from "react";

// CPU Scheduling Simulator
// Single-file React component (Tailwind CSS assumed)
// Features:
// - Add/Edit/Delete processes (PID, arrival, burst, priority)
// - Choose algorithm: FCFS, SJF (NP), SRTF, Priority (NP/Preemptive), Round Robin
// - Quantum for RR, preemptive toggle for Priority
// - Run simulation -> Gantt chart (SVG), metrics table, and timeline details
// - Nice UI with Tailwind utility classes
// Utility: generate distinct pastel colors

function colorForPid(pid) {
  // simple hash -> HSL
  let h = 0;
  for (let i = 0; i < pid.length; i++) h = (h * 31 + pid.charCodeAt(i)) % 360;
  return `hsl(${h}, 70%, 75%)`;
}

function compressSchedule(schedule) {
  // merge contiguous segments of same pid
  if (!schedule.length) return [];
  const out = [];
  for (let seg of schedule) {
    const [pid, s, e] = seg;
    if (
      out.length &&
      out[out.length - 1][0] === pid &&
      Math.abs(out[out.length - 1][2] - s) < 1e-9
    ) {
      out[out.length - 1][2] = e;
    } else out.push([pid, s, e]);
  }
  return out;
}

// Simulation helper: clone process objects
function cloneProcesses(processes) {
  return processes.map((p) => ({
    pid: p.pid,
    arrival: Number(p.arrival),
    burst: Number(p.burst),
    priority: Number(p.priority || 0),
    remaining: Number(p.burst),
    start: null,
    completion: null,
    response: null,
  }));
}

// FCFS
function simulateFCFS(input) {
  const procs = cloneProcesses(input).sort(
    (a, b) => a.arrival - b.arrival || a.pid.localeCompare(b.pid)
  );
  let time = 0;
  const schedule = [];
  for (let p of procs) {
    if (time < p.arrival) {
      schedule.push([null, time, p.arrival]);
      time = p.arrival;
    }
    p.start = time;
    p.response = p.start - p.arrival;
    schedule.push([p.pid, time, time + p.burst]);
    time += p.burst;
    p.completion = time;
  }
  return { procs, schedule: compressSchedule(schedule) };
}

// SJF Non-preemptive
function simulateSJFNonPreemptive(input) {
  const procs = cloneProcesses(input);
  let time = 0;
  const schedule = [];
  let completed = 0;
  const n = procs.length;
  while (completed < n) {
    const ready = procs.filter(
      (p) => p.arrival <= time && p.completion == null
    );
    if (ready.length === 0) {
      const next = Math.min(
        ...procs.filter((p) => p.completion == null).map((p) => p.arrival)
      );
      schedule.push([null, time, next]);
      time = next;
      continue;
    }
    ready.sort(
      (a, b) =>
        a.burst - b.burst || a.arrival - b.arrival || a.pid.localeCompare(b.pid)
    );
    const cur = ready[0];
    cur.start = time;
    cur.response = cur.start - cur.arrival;
    schedule.push([cur.pid, time, time + cur.burst]);
    time += cur.burst;
    cur.completion = time;
    completed++;
  }
  return { procs, schedule: compressSchedule(schedule) };
}

// SRTF (preemptive SJF)
function simulateSRTF(input) {
  const procs = cloneProcesses(input);
  let time = 0;
  const schedule = [];
  let completed = 0;
  const n = procs.length;
  while (completed < n) {
    let ready = procs.filter((p) => p.arrival <= time && p.completion == null);
    if (ready.length === 0) {
      const next = Math.min(
        ...procs.filter((p) => p.completion == null).map((p) => p.arrival)
      );
      schedule.push([null, time, next]);
      time = next;
      continue;
    }
    ready.sort(
      (a, b) =>
        a.remaining - b.remaining ||
        a.arrival - b.arrival ||
        a.pid.localeCompare(b.pid)
    );
    const cur = ready[0];
    if (cur.start == null)
      (cur.start = time), (cur.response = cur.start - cur.arrival);
    // run 1 unit (discrete)
    schedule.push([cur.pid, time, time + 1]);
    cur.remaining -= 1;
    time += 1;
    if (cur.remaining === 0) {
      cur.completion = time;
      completed++;
    }
  }
  return { procs, schedule: compressSchedule(schedule) };
}

// Priority Scheduling (preemptive toggle)
function simulatePriority(input, preemptive = false) {
  const procs = cloneProcesses(input);
  let time = 0;
  const schedule = [];
  let completed = 0;
  const n = procs.length;
  if (!preemptive) {
    while (completed < n) {
      const ready = procs.filter(
        (p) => p.arrival <= time && p.completion == null
      );
      if (ready.length === 0) {
        const next = Math.min(
          ...procs.filter((p) => p.completion == null).map((p) => p.arrival)
        );
        schedule.push([null, time, next]);
        time = next;
        continue;
      }
      ready.sort(
        (a, b) =>
          a.priority - b.priority ||
          a.arrival - b.arrival ||
          a.pid.localeCompare(b.pid)
      );
      const cur = ready[0];
      cur.start = time;
      cur.response = cur.start - cur.arrival;
      schedule.push([cur.pid, time, time + cur.burst]);
      time += cur.burst;
      cur.completion = time;
      completed++;
    }
  } else {
    while (completed < n) {
      const ready = procs.filter(
        (p) => p.arrival <= time && p.completion == null
      );
      if (ready.length === 0) {
        const next = Math.min(
          ...procs.filter((p) => p.completion == null).map((p) => p.arrival)
        );
        schedule.push([null, time, next]);
        time = next;
        continue;
      }
      ready.sort(
        (a, b) =>
          a.priority - b.priority ||
          a.arrival - b.arrival ||
          a.pid.localeCompare(b.pid)
      );
      const cur = ready[0];
      if (cur.start == null)
        (cur.start = time), (cur.response = cur.start - cur.arrival);
      schedule.push([cur.pid, time, time + 1]);
      cur.remaining -= 1;
      time += 1;
      if (cur.remaining === 0) {
        cur.completion = time;
        completed++;
      }
    }
  }
  return { procs, schedule: compressSchedule(schedule) };
}

// Round Robin
function simulateRR(input, quantum = 2) {
  const procs = cloneProcesses(input);
  let time = 0;
  const schedule = [];
  const q = [];
  const arrived = new Set();
  const n = procs.length;
  let completed = 0;
  while (completed < n) {
    // enqueue arrivals
    for (let p of procs) {
      if (p.arrival <= time && !arrived.has(p.pid)) {
        q.push(p);
        arrived.add(p.pid);
      }
    }
    if (q.length === 0) {
      const next = Math.min(
        ...procs.filter((p) => !arrived.has(p.pid)).map((p) => p.arrival)
      );
      schedule.push([null, time, next]);
      time = next;
      for (let p of procs)
        if (p.arrival <= time && !arrived.has(p.pid)) {
          q.push(p);
          arrived.add(p.pid);
        }
      continue;
    }
    const cur = q.shift();
    if (cur.start == null)
      (cur.start = time), (cur.response = cur.start - cur.arrival);
    const run = Math.min(cur.remaining, quantum);
    schedule.push([cur.pid, time, time + run]);
    time += run;
    cur.remaining -= run;
    for (let p of procs)
      if (p.arrival <= time && !arrived.has(p.pid)) {
        q.push(p);
        arrived.add(p.pid);
      }
    if (cur.remaining === 0) {
      cur.completion = time;
      completed++;
    } else {
      q.push(cur);
    }
  }
  return { procs, schedule: compressSchedule(schedule) };
}

function calcMetrics(procs) {
  const totals = { tat: 0, wt: 0, rt: 0 };
  for (let p of procs) {
    const tat = p.completion - p.arrival;
    const wt = tat - p.burst;
    const rt = p.response ?? 0;
    totals.tat += tat;
    totals.wt += wt;
    totals.rt += rt;
  }
  return {
    procs: procs.map((p) => ({
      pid: p.pid,
      arrival: p.arrival,
      burst: p.burst,
      priority: p.priority,
      start: p.start,
      completion: p.completion,
      tat: p.completion - p.arrival,
      wt: p.completion - p.arrival - p.burst,
      rt: p.response ?? 0,
    })),
    avg: {
      tat: (totals.tat / procs.length).toFixed(2),
      wt: (totals.wt / procs.length).toFixed(2),
      rt: (totals.rt / procs.length).toFixed(2),
    },
  };
}

// Simple CSV parse for quick import
function parseCSV(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l);
  const rows = lines.map((l) => l.split(/,|\t/).map((x) => x.trim()));
  // assume header if non-numeric in first row
  const header = rows[0].map((h) => h.toLowerCase());
  const hasHeader = header.some((h) => isNaN(Number(h)));
  const data = [];
  const startIdx = hasHeader ? 1 : 0;
  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 2) continue;
    data.push({
      pid: r[0] || `P${i}`,
      arrival: Number(r[1] || 0),
      burst: Number(r[2] || 0),
      priority: Number(r[3] || 0),
    });
  }
  return data;
}

export default function App() {
  const [processes, setProcesses] = useState([
    { pid: "P1", arrival: 0, burst: 8, priority: 2 },
    { pid: "P2", arrival: 1, burst: 4, priority: 1 },
    { pid: "P3", arrival: 2, burst: 9, priority: 3 },
    { pid: "P4", arrival: 3, burst: 5, priority: 2 },
  ]);
  const [algo, setAlgo] = useState("FCFS");
  const [quantum, setQuantum] = useState(3);
  const [preemptivePriority, setPreemptivePriority] = useState(false);
  const [schedule, setSchedule] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);

  function addProcess() {
    const next = `P${processes.length + 1}`;
    setProcesses([
      ...processes,
      { pid: next, arrival: 0, burst: 1, priority: 0 },
    ]);
  }
  function removeProcess(pid) {
    setProcesses(processes.filter((p) => p.pid !== pid));
  }
  function updateProcess(pid, key, value) {
    setProcesses(
      processes.map((p) => (p.pid === pid ? { ...p, [key]: value } : p))
    );
  }

  function runSimulation() {
    setError(null);
    try {
      // basic validation
      for (let p of processes) {
        if (!p.pid) throw new Error("Each process must have a PID");
        if (isNaN(Number(p.arrival)) || isNaN(Number(p.burst)))
          throw new Error("Arrival and burst must be numbers");
        if (Number(p.burst) <= 0) throw new Error("Burst must be > 0");
      }
      let res;
      if (algo === "FCFS") res = simulateFCFS(processes);
      else if (algo === "SJF") res = simulateSJFNonPreemptive(processes);
      else if (algo === "SRTF") res = simulateSRTF(processes);
      else if (algo === "PRIORITY")
        res = simulatePriority(processes, preemptivePriority);
      else if (algo === "RR") res = simulateRR(processes, Number(quantum));
      else throw new Error("Unknown algorithm");
      const m = calcMetrics(res.procs);
      setSchedule(res.schedule);
      setMetrics(m);
    } catch (e) {
      setError(e.message);
      setSchedule([]);
      setMetrics(null);
    }
  }

  const totalTime = useMemo(() => {
    if (!schedule.length) return 0;
    return Math.max(...schedule.map((s) => s[2]));
  }, [schedule]);

  // SVG Gantt rendering
  function Gantt({ schedule }) {
    if (!schedule || schedule.length === 0)
      return (
        <div className="p-6 text-gray-500">
          Run simulation to see Gantt chart
        </div>
      );
    const width = 900;
    const height = 120;
    const padding = 40;
    const timeMax = Math.max(...schedule.map((s) => s[2]));
    const scale = (t) => (t / Math.max(1, timeMax)) * (width - padding * 2);
    return (
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full max-w-[900px] shadow rounded bg-white"
        >
          <rect x="0" y="0" width={width} height={height} fill="transparent" />
          {/* time axis */}
          <g transform={`translate(${padding}, 20)`}>
            {schedule.map((seg, i) => {
              const [pid, s, e] = seg;
              const x = scale(s);
              const w = Math.max(2, scale(e) - scale(s));
              const color = pid ? colorForPid(pid) : "#eee";
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={10}
                    width={w}
                    height={40}
                    rx={6}
                    ry={6}
                    fill={color}
                    stroke="#333"
                    strokeWidth={0.6}
                  />
                  <text
                    x={x + w / 2}
                    y={35}
                    fontSize={11}
                    textAnchor="middle"
                    fill="#111"
                  >
                    {pid ?? "idle"}
                  </text>
                </g>
              );
            })}
            {/* ticks */}
            {Array.from({ length: Math.max(2, Math.ceil(timeMax) + 1) }).map(
              (_, i) => (
                <g key={i} transform={`translate(${scale(i)}, 60)`}>
                  <line x1={0} y1={0} x2={0} y2={6} stroke="#666" />
                  <text x={0} y={20} fontSize={10} textAnchor="middle">
                    {i}
                  </text>
                </g>
              )
            )}
          </g>
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">CPU Scheduling Simulator</h1>
            <p className="text-sm text-gray-600">
              Interactive simulator: FCFS, SJF, SRTF, Priority, Round Robin —
              beautiful Gantt charts & metrics
            </p>
          </div>
          <div>
            <button
              onClick={() => {
                setProcesses([
                  { pid: "P1", arrival: 0, burst: 8, priority: 2 },
                  { pid: "P2", arrival: 1, burst: 4, priority: 1 },
                  { pid: "P3", arrival: 2, burst: 9, priority: 3 },
                  { pid: "P4", arrival: 3, burst: 5, priority: 2 },
                ]);
                setSchedule([]);
                setMetrics(null);
              }}
              className="px-4 py-2 bg-white border rounded shadow-sm text-sm"
            >
              Load Sample
            </button>
          </div>
        </header>

        <main className="grid grid-cols-12 gap-6">
          <section className="col-span-12 lg:col-span-7 bg-white rounded p-4 shadow">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Processes</h2>
              <div className="flex gap-2">
                <button
                  onClick={addProcess}
                  className="px-3 py-1 border rounded text-sm"
                >
                  Add
                </button>
                <label className="px-3 py-1 border rounded text-sm cursor-pointer bg-white">
                  Import CSV
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const text = String(ev.target.result);
                        const parsed = parseCSV(text);
                        if (parsed.length) setProcesses(parsed);
                      };
                      reader.readAsText(f);
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full table-auto text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="p-2">PID</th>
                    <th className="p-2">Arrival</th>
                    <th className="p-2">Burst</th>
                    <th className="p-2">Priority</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {processes.map((p) => (
                    <tr key={p.pid} className="odd:bg-gray-50">
                      <td className="p-2">
                        <input
                          value={p.pid}
                          onChange={(e) =>
                            updateProcess(p.pid, "pid", e.target.value)
                          }
                          className="w-20 p-1 border rounded"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={0}
                          value={p.arrival}
                          onChange={(e) =>
                            updateProcess(
                              p.pid,
                              "arrival",
                              Number(e.target.value)
                            )
                          }
                          className="w-20 p-1 border rounded"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={1}
                          value={p.burst}
                          onChange={(e) =>
                            updateProcess(
                              p.pid,
                              "burst",
                              Number(e.target.value)
                            )
                          }
                          className="w-20 p-1 border rounded"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={p.priority}
                          onChange={(e) =>
                            updateProcess(
                              p.pid,
                              "priority",
                              Number(e.target.value)
                            )
                          }
                          className="w-20 p-1 border rounded"
                        />
                      </td>
                      <td className="p-2">
                        <button
                          onClick={() => removeProcess(p.pid)}
                          className="px-2 py-1 text-xs border rounded"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 items-center">
              <div>
                <label className="block text-sm font-medium">Algorithm</label>
                <select
                  value={algo}
                  onChange={(e) => setAlgo(e.target.value)}
                  className="mt-1 p-2 border rounded w-full"
                >
                  <option value="FCFS">FCFS</option>
                  <option value="SJF">SJF (Non-Preemptive)</option>
                  <option value="SRTF">SRTF (Preemptive SJF)</option>
                  <option value="PRIORITY">Priority Scheduling</option>
                  <option value="RR">Round Robin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium">
                  Quantum (for RR)
                </label>
                <input
                  type="number"
                  min={1}
                  value={quantum}
                  onChange={(e) => setQuantum(Number(e.target.value))}
                  className="mt-1 p-2 border rounded w-full"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 mt-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={preemptivePriority}
                  onChange={(e) => setPreemptivePriority(e.target.checked)}
                />{" "}
                Priority Preemptive
              </label>
              <button
                onClick={runSimulation}
                className="ml-auto px-4 py-2 bg-indigo-600 text-white rounded shadow"
              >
                Run Simulation
              </button>
              <button
                onClick={() => {
                  setSchedule([]);
                  setMetrics(null);
                }}
                className="px-3 py-2 border rounded"
              >
                Reset
              </button>
            </div>
            {error && <div className="mt-3 text-red-600">{error}</div>}
          </section>

          <aside className="col-span-12 lg:col-span-5 space-y-4">
            <div className="bg-white rounded p-4 shadow">
              <h3 className="font-semibold">Gantt Chart</h3>
              <div className="mt-3">
                <Gantt schedule={schedule} />
              </div>
            </div>

            <div className="bg-white rounded p-4 shadow">
              <h3 className="font-semibold">Metrics</h3>
              <div className="mt-3">
                {metrics ? (
                  <div>
                    <div className="text-sm text-gray-600">
                      Averages: TAT {metrics.avg.tat}, WT {metrics.avg.wt}, RT{" "}
                      {metrics.avg.rt}
                    </div>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-gray-500">
                          <tr>
                            <th className="p-1">PID</th>
                            <th className="p-1">AT</th>
                            <th className="p-1">BT</th>
                            <th className="p-1">ST</th>
                            <th className="p-1">CT</th>
                            <th className="p-1">TAT</th>
                            <th className="p-1">WT</th>
                            <th className="p-1">RT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metrics.procs.map((p) => (
                            <tr key={p.pid} className="odd:bg-gray-50">
                              <td className="p-1">{p.pid}</td>
                              <td className="p-1">{p.arrival}</td>
                              <td className="p-1">{p.burst}</td>
                              <td className="p-1">{p.start ?? "-"}</td>
                              <td className="p-1">{p.completion}</td>
                              <td className="p-1">{p.tat}</td>
                              <td className="p-1">{p.wt}</td>
                              <td className="p-1">{p.rt}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">
                    Run simulation to see metrics
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded p-4 shadow">
              <h3 className="font-semibold">Legend & Controls</h3>
              <div className="mt-2 text-sm text-gray-600">
                <p>
                  Colors are assigned per PID. Idle slots are shown in light
                  gray.
                </p>
                <p className="mt-2">
                  Tip: Use small quantum for RR to see frequent context
                  switches. Toggle preemptive for Priority to compare behaviour.
                </p>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
