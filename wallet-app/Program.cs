using System.Net.Http.Json;
using System.Numerics;
using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DeroMWallet;

internal static class Program
{
    [STAThread]
    static void Main()
    {
        if (Environment.GetCommandLineArgs().Contains("--crypto-check", StringComparer.Ordinal))
        {
            Console.WriteLine(Convert.ToHexString(Ripemd160.Hash(Array.Empty<byte>())).ToLowerInvariant());
            using var key = ECDsa.Create(ECCurve.CreateFromFriendlyName("secP256k1")); var p = key.ExportParameters(true); var pub = new byte[65]; pub[0] = 4; Buffer.BlockCopy(p.Q.X!, 0, pub, 1, 32); Buffer.BlockCopy(p.Q.Y!, 0, pub, 33, 32); var address = AddressCodec.FromPublicKey(pub); var backup = WalletCrypto.Encrypt(address, pub, p.D!, "DeroM-Test-Passphrase-01"); var restored = WalletCrypto.Decrypt(backup, "DeroM-Test-Passphrase-01"); if (!CryptographicOperations.FixedTimeEquals(p.D!, restored)) throw new Exception("Wallet encryption round-trip failed."); Console.WriteLine(address); return;
        }
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}

sealed class MainForm : Form
{
    static readonly Color Bg = Color.FromArgb(10, 15, 24), Panel = Color.FromArgb(17, 25, 38), Line = Color.FromArgb(37, 50, 69), TextColor = Color.FromArgb(235, 241, 250), Muted = Color.FromArgb(146, 163, 184), Accent = Color.FromArgb(76, 201, 156);
    readonly string Store = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DeroM", "wallet.json");
    readonly Label addressValue = new() { Text = "Create a wallet or restore a backup", ForeColor = Muted, AutoEllipsis = true, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
    readonly Label balanceValue = new() { Text = "— DERM", ForeColor = TextColor, Font = new Font("Segoe UI", 25, FontStyle.Bold), AutoSize = true };
    readonly Label status = new() { Text = "Wallet keys stay on this computer. Connect to your node for balance updates.", ForeColor = Muted, AutoSize = true };
    readonly Label heightValue = new() { Text = "Node: offline", ForeColor = Muted, AutoSize = true };
    string? address;
    System.Windows.Forms.Timer timer = new() { Interval = 5000 };

    public MainForm()
    {
        Text = "DeroM Wallet"; MinimumSize = new Size(760, 560); Size = new Size(900, 650); StartPosition = FormStartPosition.CenterScreen; BackColor = Bg; ForeColor = TextColor; Font = new Font("Segoe UI", 10); Padding = new Padding(28);
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 6, BackColor = Bg };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 64)); root.RowStyles.Add(new RowStyle(SizeType.Absolute, 180)); root.RowStyles.Add(new RowStyle(SizeType.Absolute, 122)); root.RowStyles.Add(new RowStyle(SizeType.Absolute, 70)); root.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); root.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
        Controls.Add(root);
        var header = new Panel { Dock = DockStyle.Fill, BackColor = Bg };
        var brand = new Label { Text = "DEROM", Font = new Font("Segoe UI", 19, FontStyle.Bold), ForeColor = TextColor, AutoSize = true, Location = new Point(0, 5) };
        var badge = new Label { Text = "DEVNET WALLET", ForeColor = Accent, AutoSize = true, Location = new Point(115, 17), Font = new Font("Segoe UI", 9, FontStyle.Bold) };
        header.Controls.Add(brand); header.Controls.Add(badge); root.Controls.Add(header, 0, 0);
        var balanceCard = Card(); var btitle = LabelText("TOTAL BALANCE", Muted, 9, true); btitle.Location = new Point(22, 18); balanceCard.Controls.Add(btitle); balanceValue.Location = new Point(20, 49); balanceCard.Controls.Add(balanceValue); heightValue.Location = new Point(22, 117); balanceCard.Controls.Add(heightValue); root.Controls.Add(balanceCard, 0, 1);
        var walletCard = Card(); var wtitle = LabelText("YOUR WALLET ADDRESS", Muted, 9, true); wtitle.Location = new Point(22, 16); walletCard.Controls.Add(wtitle); addressValue.Location = new Point(22, 43); addressValue.Width = 810; addressValue.Font = new Font("Consolas", 10); walletCard.Controls.Add(addressValue); root.Controls.Add(walletCard, 0, 2);
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, BackColor = Bg, Padding = new Padding(0, 12, 0, 0), WrapContents = false };
        buttons.Controls.Add(Button("Create wallet", Accent, Bg, CreateWallet)); buttons.Controls.Add(Button("Restore backup", Line, TextColor, Restore)); buttons.Controls.Add(Button("Copy address", Line, TextColor, CopyAddress)); buttons.Controls.Add(Button("Export backup", Line, TextColor, Export)); root.Controls.Add(buttons, 0, 3);
        var info = Card(); var infoText = LabelText("Connect your DeroM node", TextColor, 12, true); infoText.Location = new Point(22, 20); info.Controls.Add(infoText); var help = LabelText("Run your DeroM node on this PC (127.0.0.1:8080). The wallet checks its local API for balance and chain height. Mine to the address above using your node’s Stratum endpoint. This development chain does not support sending transactions yet.", Muted, 10); help.Location = new Point(22, 55); help.Size = new Size(790, 68); info.Controls.Add(help); root.Controls.Add(info, 0, 4);
        status.Dock = DockStyle.Fill; status.TextAlign = ContentAlignment.MiddleLeft; root.Controls.Add(status, 0, 5);
        timer.Tick += async (_, _) => await RefreshNode(); timer.Start(); Shown += async (_, _) => { if (File.Exists(Store)) { try { var saved = JsonSerializer.Deserialize<WalletFile>(File.ReadAllText(Store)); if (saved != null) { address = saved.Address; addressValue.Text = address; status.Text = "Encrypted wallet loaded from this PC."; } } catch { status.Text = "Saved wallet file could not be read. Restore from your backup."; } } await RefreshNode(); };
    }
    Panel Card() => new() { Dock = DockStyle.Fill, BackColor = Panel, Margin = new Padding(0, 0, 0, 14), Padding = new Padding(12) };
    static Label LabelText(string s, Color c, float size, bool bold = false) => new() { Text = s, ForeColor = c, Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular), AutoSize = true };
    Button Button(string s, Color back, Color fore, Action action) { var b = new Button { Text = s, BackColor = back, ForeColor = fore, FlatStyle = FlatStyle.Flat, Height = 42, Width = s.Length > 15 ? 150 : 132, Margin = new Padding(0, 0, 10, 0), Cursor = Cursors.Hand }; b.FlatAppearance.BorderColor = Line; b.Click += (_, _) => action(); return b; }
    void CreateWallet()
    {
        if (address != null && MessageBox.Show("Create a new wallet? Export your current backup first if you still need it.", "Create wallet", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        using var dlg = new PasswordDialog("Create wallet", "Choose a strong passphrase to encrypt your wallet file."); if (dlg.ShowDialog(this) != DialogResult.OK) return;
        try
        {
            using var key = ECDsa.Create(ECCurve.CreateFromFriendlyName("secP256k1")); var p = key.ExportParameters(true); var pub = new byte[65]; pub[0] = 4; Buffer.BlockCopy(p.Q.X!, 0, pub, 1, 32); Buffer.BlockCopy(p.Q.Y!, 0, pub, 33, 32);
            var addr = AddressCodec.FromPublicKey(pub); var file = WalletCrypto.Encrypt(addr, pub, p.D!, dlg.Password); Save(file); Apply(file); status.Text = "Wallet created and encrypted on this PC. Export a backup and keep your passphrase safe.";
        }
        catch (Exception ex) { MessageBox.Show(this, ex.Message, "Wallet creation failed", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
    void Restore()
    {
        using var ofd = new OpenFileDialog { Filter = "DeroM wallet backup (*.json)|*.json|All files (*.*)|*.*", Title = "Restore DeroM wallet backup" }; if (ofd.ShowDialog(this) != DialogResult.OK) return;
        try { var file = JsonSerializer.Deserialize<WalletFile>(File.ReadAllText(ofd.FileName)) ?? throw new Exception("Invalid backup file."); using var dlg = new PasswordDialog("Restore wallet", "Enter the passphrase used to encrypt this backup."); if (dlg.ShowDialog(this) != DialogResult.OK) return; _ = WalletCrypto.Decrypt(file, dlg.Password); Save(file); Apply(file); status.Text = "Backup verified and wallet restored to this PC."; }
        catch (Exception ex) { MessageBox.Show(this, "Could not restore wallet. Check the file and passphrase.\n\n" + ex.Message, "Restore failed", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
    void Export()
    {
        if (!File.Exists(Store)) { MessageBox.Show(this, "Create or restore a wallet first."); return; } using var sfd = new SaveFileDialog { Filter = "DeroM encrypted wallet backup (*.json)|*.json", FileName = "DeroM-wallet-backup.json" }; if (sfd.ShowDialog(this) == DialogResult.OK) { File.Copy(Store, sfd.FileName, true); status.Text = "Encrypted backup exported. Store it somewhere safe."; }
    }
    void CopyAddress() { if (address == null) { MessageBox.Show(this, "Create or restore a wallet first."); return; } Clipboard.SetText(address); status.Text = "Wallet address copied."; }
    void Save(WalletFile file) { Directory.CreateDirectory(Path.GetDirectoryName(Store)!); File.WriteAllText(Store, JsonSerializer.Serialize(file, new JsonSerializerOptions { WriteIndented = true })); }
    void Apply(WalletFile file) { address = file.Address; addressValue.Text = address; _ = RefreshNode(); }
    async Task RefreshNode()
    {
        try { using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) }; var state = await http.GetFromJsonAsync<JsonElement>("http://127.0.0.1:8080/api/state"); var h = state.GetProperty("height").GetInt32(); heightValue.Text = $"Node online · block height {h:N0}"; if (address != null) { var bal = await http.GetFromJsonAsync<JsonElement>("http://127.0.0.1:8080/api/balance/" + Uri.EscapeDataString(address)); var atomic = BigInteger.Parse(bal.GetProperty("atomicUnits").GetString() ?? "0"); balanceValue.Text = $"{(decimal)atomic / 100_000_000m:N8} DERM"; } }
        catch { heightValue.Text = "Node offline · start DeroM node to sync balance"; if (address != null) balanceValue.Text = "— DERM"; }
    }
}

sealed class PasswordDialog : Form
{
    readonly TextBox box = new() { UseSystemPasswordChar = true, Width = 320, Location = new Point(20, 70) }; public string Password => box.Text;
    public PasswordDialog(string title, string note) { Text = title; FormBorderStyle = FormBorderStyle.FixedDialog; StartPosition = FormStartPosition.CenterParent; ClientSize = new Size(365, 165); MinimizeBox = false; MaximizeBox = false; BackColor = Color.FromArgb(17,25,38); ForeColor = Color.White; Controls.Add(new Label { Text = note, Location = new Point(20,20), AutoSize = true, ForeColor = Color.White }); Controls.Add(box); var ok = new Button { Text = "Continue", DialogResult = DialogResult.OK, Location = new Point(240,115), Width = 100 }; Controls.Add(ok); AcceptButton = ok; }
    protected override void OnFormClosing(FormClosingEventArgs e) { if (DialogResult == DialogResult.OK && Password.Length < 10) { MessageBox.Show(this, "Use a passphrase with at least 10 characters."); e.Cancel = true; } base.OnFormClosing(e); }
}

sealed class WalletFile
{
    public string Format { get; set; } = "DeroM encrypted wallet backup"; public int Version { get; set; } = 1; public string Network { get; set; } = "derom-devnet"; public string Address { get; set; } = ""; public string PublicKey { get; set; } = ""; public string Kdf { get; set; } = "PBKDF2-SHA256-600000"; public string Salt { get; set; } = ""; public string Cipher { get; set; } = "AES-256-GCM"; public string Iv { get; set; } = ""; public string Tag { get; set; } = ""; public string Ciphertext { get; set; } = "";
}

static class WalletCrypto
{
    public static WalletFile Encrypt(string address, byte[] pub, byte[] priv, string password) { byte[] salt = RandomNumberGenerator.GetBytes(16), iv = RandomNumberGenerator.GetBytes(12), key = Rfc2898DeriveBytes.Pbkdf2(password, salt, 600000, HashAlgorithmName.SHA256, 32), cipher = new byte[priv.Length], tag = new byte[16]; using var aes = new AesGcm(key, 16); aes.Encrypt(iv, priv, cipher, tag, Encoding.UTF8.GetBytes(address)); CryptographicOperations.ZeroMemory(key); return new WalletFile { Address = address, PublicKey = Convert.ToHexString(pub).ToLowerInvariant(), Salt = Convert.ToHexString(salt).ToLowerInvariant(), Iv = Convert.ToHexString(iv).ToLowerInvariant(), Tag = Convert.ToHexString(tag).ToLowerInvariant(), Ciphertext = Convert.ToHexString(cipher).ToLowerInvariant() }; }
    public static byte[] Decrypt(WalletFile f, string password) { if (f.Format != "DeroM encrypted wallet backup" || f.Network != "derom-devnet" || f.Version != 1) throw new Exception("Backup format or network is not supported."); var salt = Convert.FromHexString(f.Salt); var iv = Convert.FromHexString(f.Iv); var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, 600000, HashAlgorithmName.SHA256, 32); var priv = new byte[32]; using var aes = new AesGcm(key, 16); aes.Decrypt(iv, Convert.FromHexString(f.Ciphertext), Convert.FromHexString(f.Tag), priv, Encoding.UTF8.GetBytes(f.Address)); CryptographicOperations.ZeroMemory(key); using var ec = ECDsa.Create(new ECParameters { Curve = ECCurve.CreateFromFriendlyName("secP256k1"), D = priv }); var p = ec.ExportParameters(false); var pub = new byte[65]; pub[0] = 4; Buffer.BlockCopy(p.Q.X!, 0, pub, 1, 32); Buffer.BlockCopy(p.Q.Y!, 0, pub, 33, 32); if (Convert.ToHexString(pub).ToLowerInvariant() != f.PublicKey || AddressCodec.FromPublicKey(pub) != f.Address) throw new Exception("Wallet key/address check failed."); return priv; }
}

static class AddressCodec
{
    const string Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    public static string FromPublicKey(byte[] pub) { var payload = new byte[21]; payload[0] = 0x35; var hash = Ripemd160.Hash(SHA256.HashData(pub)); Buffer.BlockCopy(hash, 0, payload, 1, 20); var chk = SHA256.HashData(SHA256.HashData(payload)); var all = new byte[25]; Buffer.BlockCopy(payload, 0, all, 0, 21); Buffer.BlockCopy(chk, 0, all, 21, 4); return Base58(all); }
    static string Base58(byte[] bytes) { var n = new BigInteger(bytes, true, true); var s = new StringBuilder(); while (n > 0) { n = BigInteger.DivRem(n, 58, out var rem); s.Insert(0, Alphabet[(int)rem]); } foreach (var b in bytes) { if (b != 0) break; s.Insert(0, '1'); } return s.ToString(); }
}

static class Ripemd160
{
    static readonly int[] R1={0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8,3,10,14,4,9,15,8,1,2,7,0,6,13,11,5,12,1,9,11,10,0,8,12,4,13,3,7,15,14,5,6,2,4,0,5,9,7,12,2,10,14,1,3,8,11,6,15,13};
    static readonly int[] R2={5,14,7,0,9,2,11,4,13,6,15,8,1,10,3,12,6,11,3,7,0,13,5,10,14,15,8,12,4,9,1,2,15,5,1,3,7,14,6,9,11,8,12,2,10,0,4,13,8,6,4,1,3,11,15,0,5,12,2,13,9,7,10,14,12,15,10,4,1,5,8,7,6,2,13,14,0,3,9,11};
    static readonly int[] S1={11,14,15,12,5,8,7,9,11,13,14,15,6,7,9,8,7,6,8,13,11,9,7,15,7,12,15,9,11,7,13,12,11,13,6,7,14,9,13,15,14,8,13,6,5,12,7,5,11,12,14,15,14,15,9,8,9,14,5,6,8,6,5,12,9,15,5,11,6,8,13,12,5,12,13,14,11,8,5,6};
    static readonly int[] S2={8,9,9,11,13,15,15,5,7,7,8,11,14,14,12,6,9,13,15,7,12,8,9,11,7,7,12,7,6,15,13,11,9,7,15,11,8,6,6,14,12,13,5,14,13,13,7,5,15,5,8,11,14,14,6,14,6,9,12,9,12,5,15,8,8,5,12,9,12,5,14,6,8,13,6,5,15,13,11,11};
    static uint Rol(uint x,int n)=>(x<<n)|(x>>(32-n));
    static uint F(int j,uint x,uint y,uint z)=>j switch { <16=>x^y^z,<32=>(x&y)|(~x&z),<48=>(x|~y)^z,<64=>(x&z)|(y&~z),_=>x^(y|~z)};
    static uint K1(int j)=>j switch {<16=>0,<32=>0x5a827999,<48=>0x6ed9eba1,<64=>0x8f1bbcdc,_=>0xa953fd4e};
    static uint K2(int j)=>j switch {<16=>0x50a28be6,<32=>0x5c4dd124,<48=>0x6d703ef3,<64=>0x7a6d76e9,_=>0};
    public static byte[] Hash(byte[] input)
    {
        int len=input.Length; int padded=((len+9+63)/64)*64; var data=new byte[padded]; Buffer.BlockCopy(input,0,data,0,len); data[len]=0x80; BinaryPrimitives.WriteUInt64LittleEndian(data.AsSpan(padded-8), (ulong)len*8);
        uint h0=0x67452301,h1=0xefcdab89,h2=0x98badcfe,h3=0x10325476,h4=0xc3d2e1f0;
        for(int off=0;off<padded;off+=64){var x=new uint[16];for(int i=0;i<16;i++)x[i]=BinaryPrimitives.ReadUInt32LittleEndian(data.AsSpan(off+i*4,4)); uint a=h0,b=h1,c=h2,d=h3,e=h4,aa=h0,bb=h1,cc=h2,dd=h3,ee=h4;
            for(int j=0;j<80;j++){uint t=Rol(unchecked(a+F(j,b,c,d)+K1(j)+x[R1[j]]),S1[j])+e;a=e;e=d;d=Rol(c,10);c=b;b=t;t=Rol(unchecked(aa+F(79-j,bb,cc,dd)+K2(j)+x[R2[j]]),S2[j])+ee;aa=ee;ee=dd;dd=Rol(cc,10);cc=bb;bb=t;}
            uint z=unchecked(h1+c+dd); h1=unchecked(h2+d+ee);h2=unchecked(h3+e+aa);h3=unchecked(h4+a+bb);h4=unchecked(h0+b+cc);h0=z; }
        var output=new byte[20];BinaryPrimitives.WriteUInt32LittleEndian(output.AsSpan(0),h0);BinaryPrimitives.WriteUInt32LittleEndian(output.AsSpan(4),h1);BinaryPrimitives.WriteUInt32LittleEndian(output.AsSpan(8),h2);BinaryPrimitives.WriteUInt32LittleEndian(output.AsSpan(12),h3);BinaryPrimitives.WriteUInt32LittleEndian(output.AsSpan(16),h4);return output;
    }
}
