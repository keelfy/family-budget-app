'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { User, Users, Bell, Shield, Palette, Sun, Moon, Monitor, Copy } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { authApi } from '@/lib/api';
import { clearAuthToken, encodeCredentials, setAuthToken } from '@/lib/auth';
import { useCurrentUser } from '@/hooks/use-auth';
import { useCreateFamilyInvite, useFamilyMembers } from '@/hooks/use-family';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: user } = useCurrentUser();
  const { data: members } = useFamilyMembers();
  const createInvite = useCreateFamilyInvite();
  const [isLoading, setIsLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const { theme, setTheme } = useTheme();

  const handleSignOut = () => {
    setIsLoading(true);
    clearAuthToken();
    router.push('/login');
    router.refresh();
  };

  const handleCreateInvite = async () => {
    try {
      const invite = await createInvite.mutateAsync();
      await navigator.clipboard?.writeText(invite.code);
      toast({
        title: `Invite code: ${invite.code}`,
        description: 'Copied. Valid for 7 days, works once.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Could not create invite',
      });
    }
  };

  const handlePasswordChange = async () => {
    if (!user) return;
    try {
      await authApi.changePassword(currentPassword, newPassword);
      // The password is the API credential: keep the session on the new one.
      setAuthToken(encodeCredentials(user.email, newPassword));
      setCurrentPassword('');
      setNewPassword('');
      toast({ title: 'Password changed' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Could not change password',
      });
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" description="Manage your account and preferences" />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile
            </CardTitle>
            <CardDescription>Manage your personal information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input placeholder="Your name" defaultValue={user?.display_name ?? ''} key={user?.id} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" disabled placeholder="email@example.com" value={user?.email ?? ''} />
              </div>
            </div>
            <Button>Update Profile</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Family
            </CardTitle>
            <CardDescription>
              Everyone here shares accounts, transactions and budgets. Each member has their own allowance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="divide-y rounded-md border">
              {members?.map((member) => (
                <li key={member.id} className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center px-4 py-3">
                  <span className="font-medium">
                    {member.display_name || member.email}
                    {member.id === user?.id && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">(you)</span>
                    )}
                  </span>
                  <span className="break-all text-sm text-muted-foreground">{member.email}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="font-medium">Invite a member</p>
                <p className="text-sm text-muted-foreground">
                  They enter the code when creating their account
                </p>
              </div>
              <Button variant="outline" onClick={handleCreateInvite} disabled={createInvite.isPending}>
                <Copy className="mr-2 h-4 w-4" />
                Create Invite Code
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security
            </CardTitle>
            <CardDescription>Manage your account security</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div>
                <p className="font-medium">Password</p>
                <p className="text-sm text-muted-foreground">
                  Change your password
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Current Password</Label>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handlePasswordChange}
                disabled={!currentPassword || newPassword.length < 6}
              >
                Change Password
              </Button>
            </div>
            <Separator />
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="font-medium">Sign Out</p>
                <p className="text-sm text-muted-foreground">
                  Sign out of your account on this device
                </p>
              </div>
              <Button variant="destructive" onClick={handleSignOut} disabled={isLoading}>
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Preferences
            </CardTitle>
            <CardDescription>Customize your experience</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-medium mb-1">Theme</p>
              <p className="text-sm text-muted-foreground mb-3">
                Choose between light, dark, or system theme
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'light', label: 'Light', icon: Sun },
                  { value: 'dark', label: 'Dark', icon: Moon },
                  { value: 'system', label: 'System', icon: Monitor },
                ].map((option) => (
                  <Button
                    key={option.value}
                    variant={theme === option.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme(option.value)}
                    className={cn('gap-2', theme === option.value && 'pointer-events-none')}
                  >
                    <option.icon className="h-4 w-4" />
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            <Separator />
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="font-medium">Base Currency</p>
                <p className="text-sm text-muted-foreground">
                  All amounts are converted to EUR
                </p>
              </div>
              <span className="font-mono">EUR</span>
            </div>
            <Separator />
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="font-medium">Default Monthly Allowance</p>
                <p className="text-sm text-muted-foreground">
                  Starting limit for each new family member
                </p>
              </div>
              <span className="font-mono">150.00 EUR</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
            <CardDescription>Configure your notification preferences</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Notification settings coming soon...
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
