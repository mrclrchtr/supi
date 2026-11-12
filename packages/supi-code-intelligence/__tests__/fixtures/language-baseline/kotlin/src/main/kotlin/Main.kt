import java.io.File
import java.util.UUID

fun total(prices: List<Int>): Int {
    var sum = 0
    for (price in prices) sum += price * 2
    return sum
}

fun main() {
    println(total(listOf(1, 2)) + File("x").name.length)
}
