using Trailbrake;

var ensureReady = args.Contains("--ensure-ready", StringComparer.OrdinalIgnoreCase);
var jsonOnly = args.Contains("--json", StringComparer.OrdinalIgnoreCase);
var outPath = args.SkipWhile(arg => !string.Equals(arg, "--out", StringComparison.OrdinalIgnoreCase)).Skip(1).FirstOrDefault()
    ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Trailbrake", "npu-capability.json");

var report = NpuCapability.Capture();

if (ensureReady)
{
    var result = await NpuCapability.EnsureRecommendedProviderAsync(report);
    Console.WriteLine(result);
    report = NpuCapability.Capture();
}

Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
await File.WriteAllTextAsync(outPath, NpuCapability.ToJson(report));

if (jsonOnly)
{
    Console.WriteLine(NpuCapability.ToJson(report));
}
else
{
    NpuCapability.WriteHumanReport(report, Console.Out);
    Console.WriteLine();
    Console.WriteLine($"Status written for Trailbrake/RaceIQ: {outPath}");
}

return report.NpuFeaturesEnabled ? 0 : 2;
