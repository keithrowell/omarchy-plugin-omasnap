# Greets someone by name.
def greet(name):
    message = f"Hello, {name}!"
    return message


friends = ["Ada", "Grace", "Margaret"]
for friend in friends:
    print(greet(friend))
