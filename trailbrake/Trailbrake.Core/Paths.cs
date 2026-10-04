namespace Trailbrake;

public static class TrailbrakePaths
{
    public static string RootDirectory { get; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Trailbrake");

    public static string NpuCapabilityPath => Path.Combine(RootDirectory, "npu-capability.json");

    public static string CompanionStatusPath => Path.Combine(RootDirectory, "companion-status.json");

    public static void EnsureRoot() => Directory.CreateDirectory(RootDirectory);
}
