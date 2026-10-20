#include "vendor/sdk/first_match.h"
#include "include/default/default.h"

int first_match_value(int value) {
    return value;
}

int default_value(int value) {
    return value;
}

int c_entry(void) {
    struct FirstMatchC first = {0};
    struct DefaultC fallback = {0};
    return first_match_value(first.value) + default_value(fallback.value);
}
