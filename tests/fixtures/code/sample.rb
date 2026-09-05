# Greets someone by name.
def greet(name)
  message = "Hello, #{name}!"
  return message
end

friends = ["Ada", "Grace", "Margaret"]
friends.each do |friend|
  puts greet(friend)
end
