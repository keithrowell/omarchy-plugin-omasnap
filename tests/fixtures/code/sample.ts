// Greets someone by name.
function greet(name: string): string {
  const message: string = `Hello, ${name}!`;
  return message;
}

const friends: string[] = ["Ada", "Grace", "Margaret"];
for (const friend of friends) {
  console.log(greet(friend));
}
