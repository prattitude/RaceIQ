using System.Speech.Synthesis;

namespace Trailbrake;

/// <summary>Non-blocking Windows TTS for approach calls (one utterance at a time).</summary>
public sealed class TtsService : IDisposable
{
    private readonly SpeechSynthesizer _synth = new();
    private readonly object _gate = new();
    private bool _busy;

    public TtsService()
    {
        _synth.Rate = 2;
        _synth.Volume = 90;
        _synth.SpeakCompleted += (_, _) =>
        {
            lock (_gate) _busy = false;
        };
    }

    public void SpeakAsync(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return;
        lock (_gate)
        {
            if (_busy) return;
            _busy = true;
        }

        try
        {
            _synth.SpeakAsyncCancelAll();
            _synth.SpeakAsync(text);
        }
        catch
        {
            lock (_gate) _busy = false;
        }
    }

    public void Dispose()
    {
        _synth.SpeakAsyncCancelAll();
        _synth.Dispose();
    }
}
