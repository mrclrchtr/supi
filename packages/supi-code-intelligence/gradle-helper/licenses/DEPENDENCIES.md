# Bundled JVM dependency notices

| Artifact | Source | SHA-256 | License |
| --- | --- | --- | --- |
| `org.gradle:gradle-tooling-api:9.4.0` | [repo.gradle.org](https://repo.gradle.org/gradle/libs-releases/org/gradle/gradle-tooling-api/9.4.0/gradle-tooling-api-9.4.0.jar) | `18e900ab3fcdf77a8076ccee1897b89789f1eac654585ec33b308619b9d3f1ef` | Apache-2.0; see [LICENSE-gradle-tooling-api.txt](LICENSE-gradle-tooling-api.txt) |
| `org.slf4j:slf4j-api:2.0.17` | [repo.gradle.org](https://repo.gradle.org/gradle/libs-releases/org/slf4j/slf4j-api/2.0.17/slf4j-api-2.0.17.jar) | `7b751d952061954d5abfed7181c1f645d336091b679891591d63329c622eb832` | MIT; see [LICENSE-slf4j.txt](LICENSE-slf4j.txt) |
| `org.slf4j:slf4j-simple:2.0.17` | [repo.gradle.org](https://repo.gradle.org/gradle/libs-releases/org/slf4j/slf4j-simple/2.0.17/slf4j-simple-2.0.17.jar) | `ddfea59ac074c6d3e24ac2c38622d2d963895e17f70b38ed4bdae4d780be6964` | MIT; see [LICENSE-slf4j.txt](LICENSE-slf4j.txt) |

The Tooling API archive shades additional dependencies. [The upstream complete Gradle LICENSE](LICENSE-gradle-tooling-api.txt) and [NOTICE](NOTICE-gradle.txt) retain their notices, including ASM's BSD terms and the distribution's JSR-305 attribution. These distribution-wide files also mention components not shipped here.

The Gradle Tooling API POM declares `slf4j-api` 2.0.17. `slf4j-simple` 2.0.17 supplies the SLF4J provider, with `slf4j-api` included explicitly as its runtime dependency. No Gradle distribution-internal Tooling API JAR is bundled: the Maven artifact above is the standalone 3 MB-class artifact.
