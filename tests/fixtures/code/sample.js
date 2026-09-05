// Greets someone by name.
function greet(name) {
  const message = `Hello, ${name}!`;
  return message;
}

const friends = ["Ada", "Grace", "Margaret"];
for (const friend of friends) {
  console.log(greet(friend));
}
