// Greets someone by name.
package main

import "fmt"

func greet(name string) string {
	message := fmt.Sprintf("Hello, %s!", name)
	return message
}

func main() {
	friends := []string{"Ada", "Grace", "Margaret"}
	for _, friend := range friends {
		fmt.Println(greet(friend))
	}
}
