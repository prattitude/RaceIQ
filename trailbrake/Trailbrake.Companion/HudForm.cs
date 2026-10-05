using System.Runtime.InteropServices;

namespace Trailbrake;

/// <summary>
/// Compact click-through lower-third HUD. Paint-on-change only.
/// </summary>
public sealed class HudForm : Form
{
    private const int WsExLayered = 0x80000;
    private const int WsExTransparent = 0x20;
    private const int WsExToolWindow = 0x80;
    private const int LwaAlpha = 0x2;

    private string _corner = "";
    private string _distance = "";
    private string _tip = "";
    private string _chip = "Trailbrake";
    private string _phase = "";
    private bool _visibleContent;
    private double _opacity = 0.85;
    private double _scale = 1;
    private string _position = "bottom-center";

    public HudForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(12, 14, 18);
        DoubleBuffered = true;
        Width = 520;
        Height = 88;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= WsExLayered | WsExTransparent | WsExToolWindow;
            return cp;
        }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        ApplyOpacity();
        Reposition();
    }

    public void ApplyConfig(TrailbrakeConfig config)
    {
        _opacity = Math.Clamp(config.HudOpacity, 0.35, 1);
        _scale = Math.Clamp(config.HudScale, 0.75, 1.5);
        _position = config.HudPosition;
        Width = (int)(520 * _scale);
        Height = (int)(88 * _scale);
        ApplyOpacity();
        Reposition();
        Invalidate();
    }

    public void SetCue(CueSnapshot cue, bool hudEnabled)
    {
        if (!hudEnabled || cue.State is "unavailable" or "waiting-session")
        {
            if (Visible) Hide();
            return;
        }

        var corner = cue.CornerName ?? "";
        var distance = cue.MetersToBrake is double meters
            ? $"{Math.Max(0, Math.Round(meters)):0} m"
            : "";
        var tip = cue.TipText ?? "";
        var phase = (cue.Phase ?? "").ToUpperInvariant();
        var chip = cue.ReferenceLapId is int id
            ? (string.IsNullOrEmpty(phase) ? $"REF #{id}" : $"{phase} · REF #{id}")
            : (string.IsNullOrEmpty(phase) ? "ARMED" : phase);
        var showContent = !string.IsNullOrEmpty(corner) || cue.State == "armed";

        if (_corner == corner && _distance == distance && _tip == tip && _chip == chip && _phase == phase && _visibleContent == showContent && Visible)
        {
            return;
        }

        _corner = corner;
        _distance = distance;
        _tip = tip;
        _chip = chip;
        _phase = phase;
        _visibleContent = showContent;
        if (!Visible) Show();
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        var g = e.Graphics;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        var bounds = ClientRectangle;
        bounds.Inflate(-2, -2);
        using var plate = new SolidBrush(Color.FromArgb(210, 14, 16, 20));
        using var border = new Pen(Color.FromArgb(160, 70, 180, 220), 1f);
        g.FillRectangle(plate, bounds);
        g.DrawRectangle(border, bounds);

        var pad = (int)(14 * _scale);
        using var chipFont = new Font("Segoe UI", 8f * (float)_scale, FontStyle.Bold);
        using var cornerFont = new Font("Consolas", 16f * (float)_scale, FontStyle.Bold);
        using var distFont = new Font("Consolas", 18f * (float)_scale, FontStyle.Bold);
        using var tipFont = new Font("Segoe UI", 9f * (float)_scale, FontStyle.Regular);
        using var muted = new SolidBrush(Color.FromArgb(170, 180, 190));
        using var text = new SolidBrush(Color.FromArgb(235, 240, 245));
        using var accent = new SolidBrush(Color.FromArgb(120, 210, 255));

        g.DrawString(_chip, chipFont, muted, pad, pad - 2);
        if (!_visibleContent || string.IsNullOrEmpty(_corner))
        {
            g.DrawString("Waiting for approach", tipFont, muted, pad, pad + (int)(28 * _scale));
            return;
        }

        g.DrawString(_corner, cornerFont, text, pad, pad + (int)(16 * _scale));
        var distSize = g.MeasureString(_distance, distFont);
        g.DrawString(_distance, distFont, accent, bounds.Right - pad - distSize.Width, pad + (int)(14 * _scale));
        if (!string.IsNullOrWhiteSpace(_tip))
        {
            var tipRect = new RectangleF(pad, pad + (int)(48 * _scale), bounds.Width - pad * 2, (int)(28 * _scale));
            g.DrawString(_tip, tipFont, muted, tipRect);
        }
    }

    private void ApplyOpacity()
    {
        if (!IsHandleCreated) return;
        var alpha = (byte)Math.Clamp((int)Math.Round(_opacity * 255), 40, 255);
        SetLayeredWindowAttributes(Handle, 0, alpha, LwaAlpha);
    }

    private void Reposition()
    {
        var area = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1920, 1080);
        var x = area.Left + (area.Width - Width) / 2;
        var y = string.Equals(_position, "top-center", StringComparison.OrdinalIgnoreCase)
            ? area.Top + 36
            : area.Bottom - Height - 48;
        Location = new Point(x, y);
    }

    [DllImport("user32.dll")]
    private static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint crKey, byte bAlpha, uint dwFlags);
}
