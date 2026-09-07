# Subscribe once; the server pushes, components just listen.
ds_push stream: "demo"

svg_gauge label: "CPU", update_on: "telemetry_tick", field: :cpu
svg_gauge label: "Memory", update_on: "telemetry_tick", field: :mem

# Anywhere on the server:
DaisyStack::Push.emit("telemetry_tick",
  { cpu: cpu, mem: mem }, to: "demo")
