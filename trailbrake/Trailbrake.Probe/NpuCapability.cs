using System.Management;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Windows.AI.MachineLearning;

namespace Trailbrake;

/// <summary>
/// Shared capability report for the Trailbrake companion and RaceIQ UI.
/// GPU and CPU providers never enable Trailbrake inference.
/// </summary>
public sealed record NpuCapabilityReport(
    bool NpuFeaturesEnabled,
    HardwareSnapshot Hardware,
    IReadOnlyList<ProviderStatus> Providers,
    Recommendation Recommendation,
    DateTimeOffset CapturedAtUtc
);

public sealed record HardwareSnapshot(
    string CpuName,
    string OsVersion,
    IReadOnlyList<GpuDevice> Gpus,
    IReadOnlyList<NpuDevice> NpuDevices
);

public sealed record GpuDevice(string Name, string Manufacturer);

public sealed record NpuDevice(
    string Name,
    string Manufacturer,
    string Status,
    string? DriverVersion,
    string InstanceId
);

public sealed record ProviderStatus(
    string Name,
    string Vendor,
    string Role,
    string ReadyState,
    string Certification,
    bool RecommendedForThisPc,
    string Summary
);

public sealed record Recommendation(
    string Action,
    string Summary,
    string? ProviderName,
    IReadOnlyList<string> Steps
);

public static class NpuCapability
{
    public const string RoleNpu = "npu";
    public const string RoleGpu = "gpu";
    public const string RoleOther = "other";

    public const string ActionReady = "ready";
    public const string ActionInstallProvider = "install-provider";
    public const string ActionPrepareProvider = "prepare-provider";
    public const string ActionUpdateDriver = "update-driver";
    public const string ActionNoNpu = "no-npu";

    private static readonly ProviderCatalogEntry[] Catalog =
    [
        new("QNNExecutionProvider", "Qualcomm", RoleNpu, "Snapdragon X Elite/Plus Hexagon NPU, driver 30.0.140.0+"),
        new("VitisAIExecutionProvider", "AMD", RoleNpu, "AMD Ryzen AI NPU, Adrenalin 25.6.3–25.9.1 / NPU driver 32.00.0203.280–32.00.0203.297"),
        new("OpenVINOExecutionProvider", "Intel", RoleNpu, "Intel NPU with current Intel Windows ML drivers"),
        new("MIGraphXExecutionProvider", "AMD", RoleGpu, "AMD RDNA 3+ GPU — not used by Trailbrake"),
        new("NvTensorRTRTXExecutionProvider", "NVIDIA", RoleGpu, "NVIDIA RTX 30-series+ — not used by Trailbrake"),
        new("WebGpuExecutionProvider", "Microsoft", RoleGpu, "Experimental DirectX 12 GPU path — not used by Trailbrake"),
    ];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static NpuCapabilityReport Capture()
    {
        var hardware = CaptureHardware();
        var providers = CaptureProviders(hardware);
        var recommendation = BuildRecommendation(hardware, providers);
        var enabled = recommendation.Action == ActionReady;
        return new NpuCapabilityReport(enabled, hardware, providers, recommendation, DateTimeOffset.UtcNow);
    }

    public static string ToJson(NpuCapabilityReport report) =>
        JsonSerializer.Serialize(report, JsonOptions);

    public static async Task<string> EnsureRecommendedProviderAsync(NpuCapabilityReport report)
    {
        if (report.Recommendation.ProviderName is null)
        {
            return "No NPU provider is recommended on this PC.";
        }

        var catalog = ExecutionProviderCatalog.GetDefault();
        var provider = catalog.FindAllProviders()
            .FirstOrDefault(candidate => string.Equals(candidate.Name, report.Recommendation.ProviderName, StringComparison.Ordinal));
        if (provider is null)
        {
            return $"Windows ML does not list {report.Recommendation.ProviderName} for this PC.";
        }

        if (provider.ReadyState == ExecutionProviderReadyState.Ready)
        {
            return $"{provider.Name} is already ready.";
        }

        var result = await provider.EnsureReadyAsync();
        return result.Status == ExecutionProviderReadyResultState.Success
            ? $"{provider.Name} is ready ({result.Status})."
            : $"{provider.Name} could not be prepared: {result.Status}. {result.DiagnosticText}";
    }

    public static void WriteHumanReport(NpuCapabilityReport report, TextWriter writer)
    {
        writer.WriteLine(report.NpuFeaturesEnabled
            ? "Trailbrake NPU features can run."
            : "Trailbrake NPU features are off.");
        writer.WriteLine();
        writer.WriteLine($"CPU: {report.Hardware.CpuName}");
        writer.WriteLine($"OS:  {report.Hardware.OsVersion}");
        writer.WriteLine();
        writer.WriteLine("NPU hardware:");
        if (report.Hardware.NpuDevices.Count == 0)
        {
            writer.WriteLine("  (none detected)");
        }
        else
        {
            foreach (var device in report.Hardware.NpuDevices)
            {
                var driver = string.IsNullOrWhiteSpace(device.DriverVersion) ? "driver unknown" : $"driver {device.DriverVersion}";
                writer.WriteLine($"  - {device.Name} ({device.Manufacturer}, {device.Status}, {driver})");
            }
        }

        writer.WriteLine();
        writer.WriteLine("GPUs:");
        foreach (var gpu in report.Hardware.Gpus)
        {
            writer.WriteLine($"  - {gpu.Name} ({gpu.Manufacturer})");
        }

        writer.WriteLine();
        writer.WriteLine("Windows ML providers for this PC:");
        foreach (var provider in report.Providers)
        {
            var marker = provider.RecommendedForThisPc ? "*" : " ";
            writer.WriteLine($"  {marker} {provider.Name}: {provider.ReadyState} [{provider.Role}/{provider.Vendor}]");
            writer.WriteLine($"      {provider.Summary}");
        }

        writer.WriteLine();
        writer.WriteLine($"Recommendation: {report.Recommendation.Action}");
        writer.WriteLine(report.Recommendation.Summary);
        foreach (var step in report.Recommendation.Steps)
        {
            writer.WriteLine($"  - {step}");
        }
    }

    private static HardwareSnapshot CaptureHardware()
    {
        var cpu = QueryWmi("SELECT Name FROM Win32_Processor")
            .Select(row => Convert.ToString(row["Name"]) ?? "Unknown CPU")
            .FirstOrDefault() ?? "Unknown CPU";
        var gpus = QueryWmi("SELECT Name, AdapterCompatibility FROM Win32_VideoController")
            .Select(row => new GpuDevice(
                Convert.ToString(row["Name"]) ?? "Unknown GPU",
                Convert.ToString(row["AdapterCompatibility"]) ?? "Unknown"))
            .DistinctBy(gpu => gpu.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var npuDevices = QueryWmi("SELECT Name, Manufacturer, Status, PNPDeviceID FROM Win32_PnPEntity WHERE PNPClass = 'ComputeAccelerator'")
            .Select(row =>
            {
                var name = Convert.ToString(row["Name"]) ?? "Unknown NPU";
                var manufacturer = Convert.ToString(row["Manufacturer"]) ?? "Unknown";
                var status = Convert.ToString(row["Status"]) ?? "Unknown";
                var instanceId = Convert.ToString(row["PNPDeviceID"]) ?? "";
                return new NpuDevice(name, manufacturer, status, ReadDriverVersion(instanceId), instanceId);
            })
            .Where(device => device.Name.Contains("NPU", StringComparison.OrdinalIgnoreCase)
                || device.Name.Contains("Neural", StringComparison.OrdinalIgnoreCase)
                || device.Name.Contains("AI Boost", StringComparison.OrdinalIgnoreCase)
                || device.Name.Contains("VPU", StringComparison.OrdinalIgnoreCase))
            .ToArray();

        return new HardwareSnapshot(cpu, Environment.OSVersion.VersionString, gpus, npuDevices);
    }

    private static IReadOnlyList<ProviderStatus> CaptureProviders(HardwareSnapshot hardware)
    {
        var live = ExecutionProviderCatalog.GetDefault().FindAllProviders()
            .ToDictionary(provider => provider.Name, StringComparer.Ordinal);
        var recommendedNames = RecommendedNpuProviders(hardware).ToHashSet(StringComparer.Ordinal);

        return Catalog.Select(entry =>
        {
            live.TryGetValue(entry.Name, out var provider);
            var readyState = provider?.ReadyState.ToString() ?? "Unavailable";
            var certification = provider?.Certification.ToString() ?? "Unknown";
            var recommended = recommendedNames.Contains(entry.Name);
            var summary = recommended
                ? $"{entry.Requirements}. Preferred for this PC."
                : entry.Role == RoleNpu
                    ? $"{entry.Requirements}. Not preferred for the detected CPU/NPU."
                    : entry.Requirements;
            return new ProviderStatus(
                entry.Name,
                entry.Vendor,
                entry.Role,
                readyState,
                certification,
                recommended,
                summary);
        }).ToArray();
    }

    private static Recommendation BuildRecommendation(
        HardwareSnapshot hardware,
        IReadOnlyList<ProviderStatus> providers)
    {
        var recommended = providers.Where(provider => provider.RecommendedForThisPc).ToArray();
        if (hardware.NpuDevices.Count == 0 && recommended.Length == 0)
        {
            return new Recommendation(
                ActionNoNpu,
                "No NPU hardware or NPU execution provider is available. Trailbrake forecast features stay off.",
                null,
                [
                    "Trailbrake will not load an NPU model on this PC.",
                    "GPU providers (MIGraphX, TensorRT, WebGPU) are intentionally ignored.",
                ]);
        }

        var ready = recommended.FirstOrDefault(provider => provider.ReadyState == nameof(ExecutionProviderReadyState.Ready));
        if (ready is not null)
        {
            return new Recommendation(
                ActionReady,
                $"{ready.Name} is ready. Trailbrake can load its NPU forecast model.",
                ready.Name,
                ["Keep RaceIQ running for session context.", "Launch the Trailbrake companion when you start a drive."]);
        }

        var notReady = recommended.FirstOrDefault(provider => provider.ReadyState == nameof(ExecutionProviderReadyState.NotReady));
        if (notReady is not null)
        {
            return new Recommendation(
                ActionPrepareProvider,
                $"{notReady.Name} is installed but not ready for this app yet.",
                notReady.Name,
                [
                    $"Run: dotnet run --project trailbrake/Trailbrake.Probe -- --ensure-ready",
                    "That prepares the provider for Trailbrake without falling back to GPU or CPU.",
                ]);
        }

        var missing = recommended.FirstOrDefault(provider =>
            provider.ReadyState is nameof(ExecutionProviderReadyState.NotPresent) or "Unavailable");
        if (missing is not null)
        {
            var steps = new List<string>
            {
                $"Install/prepare {missing.Name} with: dotnet run --project trailbrake/Trailbrake.Probe -- --ensure-ready",
                "Stay on an AMD Adrenalin build that includes a supported Ryzen AI NPU driver.",
            };
            var driver = hardware.NpuDevices.FirstOrDefault()?.DriverVersion;
            if (!string.IsNullOrWhiteSpace(driver))
            {
                steps.Add($"Current NPU driver is {driver}. Documented VitisAI window is 32.00.0203.280–32.00.0203.297.");
            }

            return new Recommendation(
                ActionInstallProvider,
                $"This PC has AMD NPU hardware, but {missing.Name} is not installed yet.",
                missing.Name,
                steps);
        }

        return new Recommendation(
            ActionUpdateDriver,
            "An NPU was detected, but Windows ML did not expose a matching ready provider.",
            null,
            [
                "Update the vendor NPU driver from AMD, Intel, or Qualcomm.",
                "Re-run this probe after the driver install.",
            ]);
    }

    private static IEnumerable<string> RecommendedNpuProviders(HardwareSnapshot hardware)
    {
        var cpu = hardware.CpuName;
        var manufacturers = hardware.NpuDevices.Select(device => device.Manufacturer).ToArray();

        if (manufacturers.Any(value => value.Contains("AMD", StringComparison.OrdinalIgnoreCase))
            || cpu.Contains("Ryzen AI", StringComparison.OrdinalIgnoreCase)
            || cpu.Contains("AuthenticAMD", StringComparison.OrdinalIgnoreCase)
            || cpu.Contains("AMD", StringComparison.OrdinalIgnoreCase))
        {
            yield return "VitisAIExecutionProvider";
            yield break;
        }

        if (manufacturers.Any(value => value.Contains("Qualcomm", StringComparison.OrdinalIgnoreCase))
            || cpu.Contains("Snapdragon", StringComparison.OrdinalIgnoreCase)
            || cpu.Contains("Qualcomm", StringComparison.OrdinalIgnoreCase))
        {
            yield return "QNNExecutionProvider";
            yield break;
        }

        if (manufacturers.Any(value => value.Contains("Intel", StringComparison.OrdinalIgnoreCase))
            || cpu.Contains("Intel", StringComparison.OrdinalIgnoreCase)
            || cpu.Contains("Core Ultra", StringComparison.OrdinalIgnoreCase))
        {
            yield return "OpenVINOExecutionProvider";
        }
    }

    private static IEnumerable<ManagementBaseObject> QueryWmi(string query)
    {
        using var searcher = new ManagementObjectSearcher(query);
        foreach (ManagementBaseObject row in searcher.Get())
        {
            yield return row;
        }
    }

    private static string? ReadDriverVersion(string instanceId)
    {
        if (string.IsNullOrWhiteSpace(instanceId)) return null;
        try
        {
            using var searcher = new ManagementObjectSearcher(
                "root\\cimv2",
                $"SELECT DriverVersion FROM Win32_PnPSignedDriver WHERE DeviceID = '{EscapeWmi(instanceId)}'");
            foreach (ManagementBaseObject row in searcher.Get())
            {
                return Convert.ToString(row["DriverVersion"]);
            }
        }
        catch
        {
            // Driver version is advisory; absence must not fail capability capture.
        }

        return null;
    }

    private static string EscapeWmi(string value) => value.Replace("\\", "\\\\", StringComparison.Ordinal).Replace("'", "\\'", StringComparison.Ordinal);

    private sealed record ProviderCatalogEntry(string Name, string Vendor, string Role, string Requirements);
}
