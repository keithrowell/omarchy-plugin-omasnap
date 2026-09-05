// Greets someone by name.
function Greet({ name }: { name: string }) {
  const message = `Hello, ${name}!`;
  return <span className="greeting">{message}</span>;
}

export default Greet;
