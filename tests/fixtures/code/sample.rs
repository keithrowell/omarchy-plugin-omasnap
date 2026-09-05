// Greets someone by name.
fn greet(name: &str) -> String {
    let message = format!("Hello, {}!", name);
    return message;
}

fn main() {
    let friends = ["Ada", "Grace", "Margaret"];
    for friend in friends.iter() {
        println!("{}", greet(friend));
    }
}
