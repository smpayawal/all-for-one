class AllForOne < Formula
  desc "Personal terminal coding harness based on Pi"
  homepage "https://github.com/smpayawal/all-for-one"
  version "0.1.0-rc.1"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/smpayawal/all-for-one/releases/download/afo-v0.1.0-rc.1/all-for-one-darwin-arm64.tar.gz"
      sha256 "8f26d2db6674fe381cca32fdf5b9e7f4dcbed8c0ca1a1d2efb7d2330314d295a"
    else
      url "https://github.com/smpayawal/all-for-one/releases/download/afo-v0.1.0-rc.1/all-for-one-darwin-x64.tar.gz"
      sha256 "561dd73633703f03bfafa7666d7170db8572f00917c61a0ae0415a728a1d3287"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/smpayawal/all-for-one/releases/download/afo-v0.1.0-rc.1/all-for-one-linux-arm64.tar.gz"
      sha256 "136e7cae8636570159630d37f478ddbab5d3f600ce988cbb85b3c84243769ac8"
    else
      url "https://github.com/smpayawal/all-for-one/releases/download/afo-v0.1.0-rc.1/all-for-one-linux-x64.tar.gz"
      sha256 "f33d19265b603f77f7efe7cee2d2115ffb813dc1c17f62ac90b5c86700b94301"
    end
  end

  def install
    bin.install "allforone", "afo"
    libexec.install "pi"
  end

  test do
    assert_match "All-For-One #{version}", shell_output("#{bin}/allforone --version")
    assert_match "Usage:", shell_output("#{bin}/afo --help")
  end
end
