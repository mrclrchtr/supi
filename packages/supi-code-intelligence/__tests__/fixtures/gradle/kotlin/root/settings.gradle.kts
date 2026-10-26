rootProject.name = "fixture-kotlin-renamed-root"
include(":groups:alpha:shared", ":groups:beta:shared", ":products:legacy")
project(":groups:alpha:shared").projectDir = file("custom/alpha/shared-project")
project(":groups:beta:shared").projectDir = file("custom/beta/shared-project")
val renamed = project(":products:legacy")
renamed.projectDir = file("custom/catalog")
renamed.name = "store-api"
includeBuild("../included-sibling")
