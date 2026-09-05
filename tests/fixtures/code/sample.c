// Greets someone by name.
#include <stdio.h>

void greet(const char *name) {
    printf("Hello, %s!\n", name);
}

int main(void) {
    const char *friends[] = {"Ada", "Grace", "Margaret"};
    for (int i = 0; i < 3; i++) {
        greet(friends[i]);
    }
    return 0;
}
