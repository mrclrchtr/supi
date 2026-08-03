# Own session mechanics, not resource policy

The runtime receives Agent Session Inputs containing caller-built resources, then owns AgentSessionRuntime creation, extension binding, prompting, cancellation and timeout races, shutdown grace, usage collection, and disposal. Callers retain cwd/model/tool/resource policy, which keeps review isolation and generic profile loading outside the runtime while centralizing the proven lifecycle mechanics both adapters would otherwise duplicate.
