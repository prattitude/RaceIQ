using Microsoft.Windows.AI.MachineLearning;

// These Windows ML providers are the ones that can expose an NPU.
// A ready provider still has to be bound to an NPU device before any model runs.
// GPU and CPU devices are never a fallback.
string[] npuProviders = ["QNNExecutionProvider", "VitisAIExecutionProvider", "OpenVINOExecutionProvider"];

var providers = ExecutionProviderCatalog.GetDefault().FindAllProviders();
var npuReady = providers.Any(provider =>
    provider.ReadyState == ExecutionProviderReadyState.Ready
    && npuProviders.Contains(provider.Name, StringComparer.Ordinal));

Console.WriteLine(npuReady
    ? "Trailbrake NPU features can run. No model is loaded by this probe."
    : "Trailbrake NPU features are off. This PC has no ready NPU execution provider.");

foreach (var provider in providers.OrderBy(provider => provider.Name, StringComparer.Ordinal))
{
    Console.WriteLine($"{provider.Name}: {provider.ReadyState}");
}
