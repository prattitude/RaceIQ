using System.Media;

namespace Trailbrake;

/// <summary>
/// Procedural cue sound pack — generates short PCM WAV tones in memory (no asset files).
/// Packs: click (short tick), hat (noise burst), pulse (soft sine).
/// </summary>
public sealed class CueAudioService : IDisposable
{
    private SoundPlayer? _player;
    private MemoryStream? _stream;
    private string _pack = "click";
    private double _volume = 0.7;
    private bool _enabled = true;

    public void ApplyConfig(TrailbrakeConfig config)
    {
        _enabled = config.SoundEnabled;
        _volume = Math.Clamp(config.SoundVolume, 0, 1);
        _pack = string.IsNullOrWhiteSpace(config.SoundPack) ? "click" : config.SoundPack;
    }

    public void Play(string? soundKind)
    {
        if (!_enabled || string.IsNullOrWhiteSpace(soundKind) || _volume <= 0.01) return;
        try
        {
            var wav = BuildWav(_pack, soundKind, _volume);
            _player?.Stop();
            _player?.Dispose();
            _stream?.Dispose();
            _stream = new MemoryStream(wav);
            _player = new SoundPlayer(_stream);
            _player.Play();
        }
        catch
        {
            // Audio failures must never stall the cue loop.
        }
    }

    public void Dispose()
    {
        _player?.Stop();
        _player?.Dispose();
        _stream?.Dispose();
    }

    private static byte[] BuildWav(string pack, string kind, double volume)
    {
        var (freq, ms, noise) = ToneFor(pack, kind);
        const int sampleRate = 22050;
        var sampleCount = Math.Max(1, (int)(sampleRate * (ms / 1000.0)));
        var data = new short[sampleCount];
        var amp = (short)(Math.Clamp(volume, 0, 1) * 12000);
        var rng = new Random(kind.GetHashCode() ^ pack.GetHashCode());

        for (var i = 0; i < sampleCount; i++)
        {
            var t = i / (double)sampleRate;
            var env = 1.0 - (i / (double)sampleCount);
            env = Math.Pow(Math.Max(0, env), pack == "pulse" ? 0.6 : 1.4);
            double sample;
            if (noise)
            {
                sample = (rng.NextDouble() * 2 - 1) * env;
            }
            else
            {
                sample = Math.Sin(2 * Math.PI * freq * t) * env;
                if (pack == "click") sample = Math.Sign(sample) * Math.Min(1, Math.Abs(sample) * 2);
            }

            data[i] = (short)(sample * amp);
        }

        return EncodeWav(data, sampleRate);
    }

    private static (double Freq, double Ms, bool Noise) ToneFor(string pack, string kind)
    {
        var baseFreq = kind switch
        {
            "approach" => 660.0,
            "brake-on" => 880.0,
            "trail" => 740.0,
            "release" => 520.0,
            "exit" => 980.0,
            _ => 700.0,
        };

        return pack switch
        {
            "hat" => (baseFreq, kind == "approach" ? 55 : 35, true),
            "pulse" => (baseFreq * 0.75, kind == "approach" ? 120 : 80, false),
            _ => (baseFreq, kind == "approach" ? 45 : 28, false), // click
        };
    }

    private static byte[] EncodeWav(short[] samples, int sampleRate)
    {
        var dataBytes = samples.Length * 2;
        var stream = new MemoryStream(44 + dataBytes);
        using var writer = new BinaryWriter(stream);
        writer.Write(System.Text.Encoding.ASCII.GetBytes("RIFF"));
        writer.Write(36 + dataBytes);
        writer.Write(System.Text.Encoding.ASCII.GetBytes("WAVE"));
        writer.Write(System.Text.Encoding.ASCII.GetBytes("fmt "));
        writer.Write(16);
        writer.Write((short)1); // PCM
        writer.Write((short)1); // mono
        writer.Write(sampleRate);
        writer.Write(sampleRate * 2);
        writer.Write((short)2);
        writer.Write((short)16);
        writer.Write(System.Text.Encoding.ASCII.GetBytes("data"));
        writer.Write(dataBytes);
        foreach (var sample in samples) writer.Write(sample);
        return stream.ToArray();
    }
}
