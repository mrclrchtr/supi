# Shared terminal style and Pi launch. Each tape sets Output, Width, and Height
# before sourcing this file. record.sh exports SCREENSHOT_MODEL and SCREENSHOT_THEME.
Set Shell "zsh"
Set FontFamily "FiraCode Nerd Font Mono"
Set FontSize 16
Set Padding 20
Set Theme "Catppuccin Macchiato"
Set TypingSpeed 15ms
Hide
Type 'clear && pi --no-session --model "$SCREENSHOT_MODEL" --use-theme "$SCREENSHOT_THEME"'
Enter
Sleep 8s
Show
