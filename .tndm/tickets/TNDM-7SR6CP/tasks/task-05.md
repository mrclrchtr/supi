# Task 5: Wave 2a: Implement code_graph tests relation

Extract findTestCompanionFiles and extractTestFunctions from generate-context.ts into a shared module at src/analysis/relations/tests.ts. Wire the tests relation into execute-graph.ts's collectRelation dispatch, reusing these functions. Update generate-context.ts to import from the shared module.
