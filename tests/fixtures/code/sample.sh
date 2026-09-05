#!/usr/bin/env bash
# Greets someone by name.
greet() {
  local name="$1"
  echo "Hello, ${name}!"
}

friends=("Ada" "Grace" "Margaret")
for friend in "${friends[@]}"; do
  greet "$friend"
done
