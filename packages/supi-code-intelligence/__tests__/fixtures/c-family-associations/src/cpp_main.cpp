#include "include/cpp/configured.h"

namespace association {
int cpp_value(int value) {
    return value;
}
}

int cpp_entry() {
    association::CppOnly instance;
    return association::cpp_value(instance.member());
}
