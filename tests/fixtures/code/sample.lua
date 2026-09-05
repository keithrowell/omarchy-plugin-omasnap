-- Greets someone by name.
local function greet(name)
  local message = "Hello, " .. name .. "!"
  return message
end

local friends = {"Ada", "Grace", "Margaret"}
for _, friend in ipairs(friends) do
  print(greet(friend))
end
