import { LogOut, Brain } from 'lucide-react';
import { LiquidGlass } from '@/components/ui/LiquidGlass';

interface HeaderProps {
  userEmail?: string;
  onSignOut: () => void;
}

export const Header = ({ userEmail, onSignOut }: HeaderProps) => {
  return (
    <header className="relative z-20 py-4">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <LiquidGlass 
          className="w-full" 
          cornerRadius={32} 
          padding="16px 24px"
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">
                  Mind Palace
                </h1>
                <p className="text-xs text-white/50">Upload Portal</p>
              </div>
            </div>
            
            {userEmail && (
              <div className="flex items-center gap-4">
                <span className="text-sm text-white/60 hidden sm:block">{userEmail}</span>
                <button
                  onClick={onSignOut}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all duration-200 text-white/80 hover:text-white text-sm border border-white/10 hover:border-white/20"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </LiquidGlass>
      </div>
    </header>
  );
};
