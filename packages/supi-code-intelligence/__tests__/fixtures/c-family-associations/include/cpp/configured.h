#pragma once

namespace association {
class CppOnly {
public:
    int member() const { return 3; }
};

int cpp_value(int value);
}
