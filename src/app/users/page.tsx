'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-provider';
import { SuperAdminGuard } from '@/components/super-admin-guard';
import { Plus, Pencil, Trash2, Lock, Unlock, Copy, Check, Gift, Eye, EyeOff } from 'lucide-react';
import { ClientApiError, fetchClientJson } from '@/lib/client-api';

interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  role: string;
  status: string;
  loginCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

interface InvitationCode {
  id: string;
  code: string;
  maxUses: number;
  usedCount: number;
  status: string;
  expiresAt: string | null;
  createdAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

function UserManagementContent() {
  const { isAuthenticated } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [invitationCodes, setInvitationCodes] = useState<InvitationCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isInvitationDialogOpen, setIsInvitationDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    name: '',
    role: 'user',
    password: '',
    status: 'active',
  });

  const [invitationForm, setInvitationForm] = useState({
    maxUses: 1,
    expiresAt: '',
  });

  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams();

      if (filterRole !== 'all') params.append('role', filterRole);
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (searchTerm) params.append('search', searchTerm);

      const data = await fetchClientJson<ApiResponse<User[]>>(`/api/users?${params}`);
      if (data.success) {
        setUsers(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsLoading(false);
    }
  }, [filterRole, filterStatus, searchTerm]);

  const fetchInvitationCodes = useCallback(async () => {
    try {
      const data = await fetchClientJson<ApiResponse<InvitationCode[]>>('/api/invitation-codes');
      if (data.success) {
        setInvitationCodes(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch invitation codes:', error);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchInvitationCodes();
  }, [fetchInvitationCodes]);

  const handleGenerateInvitationCode = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const data = await fetchClientJson<ApiResponse<{ code: string }>>('/api/invitation-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invitationForm),
      });
      if (data.success) {
        setGeneratedCode(data.data.code);
        setInvitationForm({ maxUses: 1, expiresAt: '' });
        fetchInvitationCodes();
      } else {
        alert(data.error || '生成邀请码失败');
      }
    } catch (error) {
      console.error('Failed to generate invitation code:', error);
      alert(error instanceof ClientApiError ? error.message : '生成邀请码失败');
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const data = await fetchClientJson<ApiResponse<User>>('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      if (data.success) {
        setIsCreateDialogOpen(false);
        setFormData({
          username: '',
          email: '',
          name: '',
          role: 'user',
          password: '',
          status: 'active',
        });
        setShowPassword(false);
        fetchUsers();
      } else {
        alert(data.error || '创建用户失败');
      }
    } catch (error) {
      console.error('Failed to create user:', error);
      alert(error instanceof ClientApiError ? error.message : '创建用户失败');
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      const data = await fetchClientJson<ApiResponse<User>>(`/api/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      if (data.success) {
        setIsEditDialogOpen(false);
        setSelectedUser(null);
        fetchUsers();
      } else {
        alert(data.error || '更新用户失败');
      }
    } catch (error) {
      console.error('Failed to update user:', error);
      alert(error instanceof ClientApiError ? error.message : '更新用户失败');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      const data = await fetchClientJson<ApiResponse<null>>(`/api/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: formData.password }),
      });
      if (data.success) {
        setIsPasswordDialogOpen(false);
        setSelectedUser(null);
        setFormData({ ...formData, password: '' });
        setShowPassword(false);
        alert('密码重置成功');
      } else {
        alert(data.error || '密码重置失败');
      }
    } catch (error) {
      console.error('Failed to reset password:', error);
      alert(error instanceof ClientApiError ? error.message : '密码重置失败');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('确定要删除此用户吗？')) return;

    try {
      const data = await fetchClientJson<ApiResponse<null>>(`/api/users/${userId}`, {
        method: 'DELETE',
      });
      if (data.success) {
        fetchUsers();
      } else {
        alert(data.error || '删除用户失败');
      }
    } catch (error) {
      console.error('Failed to delete user:', error);
      alert(error instanceof ClientApiError ? error.message : '删除用户失败');
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

    try {
      const data = await fetchClientJson<ApiResponse<User>>(`/api/users/${userId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (data.success) {
        fetchUsers();
      } else {
        alert(data.error || '更新用户状态失败');
      }
    } catch (error) {
      console.error('Failed to update user status:', error);
      alert(error instanceof ClientApiError ? error.message : '更新用户状态失败');
    }
  };

  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      password: '',
      status: user.status,
    });
    setIsEditDialogOpen(true);
  };

  const openPasswordDialog = (user: User) => {
    setSelectedUser(user);
    setFormData({ ...formData, password: '' });
    setShowPassword(false);
    setIsPasswordDialogOpen(true);
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">用户管理</h1>
        <p className="text-muted-foreground mt-2">管理系统用户和权限</p>
      </div>

      {/* 筛选和搜索 */}
      <div className="mb-6 flex gap-4">
        <Input
          placeholder="搜索用户名、邮箱..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="角色" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有角色</SelectItem>
            <SelectItem value="super_admin">超级管理员</SelectItem>
            <SelectItem value="admin">管理员</SelectItem>
            <SelectItem value="user">普通用户</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有状态</SelectItem>
            <SelectItem value="active">启用</SelectItem>
            <SelectItem value="inactive">禁用</SelectItem>
          </SelectContent>
        </Select>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              创建用户
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建新用户</DialogTitle>
              <DialogDescription>
                创建新的系统用户账号
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateUser}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="create-username">用户名</Label>
                  <Input
                    id="create-username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-email">邮箱</Label>
                  <Input
                    id="create-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-name">姓名</Label>
                  <Input
                    id="create-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-password">密码</Label>
                  <div className="relative">
                    <Input
                      id="create-password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-role">角色</Label>
                  <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                    <SelectTrigger id="create-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">普通用户</SelectItem>
                      <SelectItem value="admin">管理员</SelectItem>
                      <SelectItem value="super_admin">超级管理员</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  取消
                </Button>
                <Button type="submit">创建</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={isInvitationDialogOpen} onOpenChange={setIsInvitationDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Gift className="mr-2 h-4 w-4" />
              生成邀请码
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>生成邀请码</DialogTitle>
              <DialogDescription>
                生成邀请码供新用户注册使用
              </DialogDescription>
            </DialogHeader>
            {!generatedCode ? (
              <form onSubmit={handleGenerateInvitationCode}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="max-uses">最大使用次数</Label>
                    <Input
                      id="max-uses"
                      type="number"
                      min="1"
                      max="100"
                      value={invitationForm.maxUses}
                      onChange={(e) => setInvitationForm({ ...invitationForm, maxUses: parseInt(e.target.value) })}
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      邀请码最多可以被使用的次数
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expires-at">过期时间（可选）</Label>
                    <Input
                      id="expires-at"
                      type="date"
                      value={invitationForm.expiresAt}
                      onChange={(e) => setInvitationForm({ ...invitationForm, expiresAt: e.target.value })}
                    />
                    <p className="text-sm text-muted-foreground">
                      留空则永不过期
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsInvitationDialogOpen(false)}>
                    取消
                  </Button>
                  <Button type="submit">生成</Button>
                </DialogFooter>
              </form>
            ) : (
              <div className="space-y-4 py-4">
                <div className="p-6 bg-muted rounded-lg">
                  <Label className="text-sm text-muted-foreground">邀请码</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      value={generatedCode}
                      readOnly
                      className="text-2xl font-mono text-center font-bold"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleCopyCode(generatedCode)}
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {copied ? '已复制到剪贴板！' : '点击复制按钮复制邀请码'}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">使用说明</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                    <li>复制邀请码并分享给需要注册的用户</li>
                    <li>用户在注册时输入此邀请码</li>
                    <li>邀请码使用 {invitationForm.maxUses} 次后失效</li>
                  </ol>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setGeneratedCode('');
                      setInvitationForm({ maxUses: 1, expiresAt: '' });
                    }}
                  >
                    继续生成
                  </Button>
                  <Button type="button" onClick={() => setIsInvitationDialogOpen(false)}>
                    完成
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* 用户列表 */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>用户名</TableHead>
            <TableHead>邮箱</TableHead>
            <TableHead>姓名</TableHead>
            <TableHead>角色</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>登录次数</TableHead>
            <TableHead>最后登录</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8">
                加载中...
              </TableCell>
            </TableRow>
          ) : users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8">
                暂无用户
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.username}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.name}</TableCell>
                <TableCell>
                  <Badge variant={user.role === 'admin' || user.role === 'super_admin' ? 'default' : 'secondary'}>
                    {user.role === 'super_admin' ? '超级管理员' : user.role === 'admin' ? '管理员' : '普通用户'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={user.status === 'active' ? 'default' : 'destructive'}>
                    {user.status === 'active' ? '启用' : '禁用'}
                  </Badge>
                </TableCell>
                <TableCell>{user.loginCount}</TableCell>
                <TableCell>
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString('zh-CN')
                    : '从未登录'}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(user)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openPasswordDialog(user)}
                    >
                      <Lock className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleStatus(user.id, user.status)}
                    >
                      {user.status === 'active' ? (
                        <Unlock className="h-4 w-4" />
                      ) : (
                        <Lock className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteUser(user.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* 邀请码列表 */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">邀请码列表</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>邀请码</TableHead>
              <TableHead>使用次数</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>过期时间</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitationCodes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  暂无邀请码
                </TableCell>
              </TableRow>
            ) : (
              invitationCodes.map((code) => (
                <TableRow key={code.id}>
                  <TableCell className="font-mono font-bold">{code.code}</TableCell>
                  <TableCell>
                    {code.usedCount} / {code.maxUses}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={code.status === 'active' ? 'default' : 'destructive'}
                    >
                      {code.status === 'active' ? '有效' : '已失效'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {code.expiresAt
                      ? new Date(code.expiresAt).toLocaleDateString('zh-CN')
                      : '永不过期'}
                  </TableCell>
                  <TableCell>
                    {new Date(code.createdAt).toLocaleString('zh-CN')}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyCode(code.code)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 编辑用户对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
            <DialogDescription>
              更新用户信息
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateUser}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-username">用户名</Label>
                <Input
                  id="edit-username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">邮箱</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-name">姓名</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">角色</Label>
                <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                  <SelectTrigger id="edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">普通用户</SelectItem>
                    <SelectItem value="admin">管理员</SelectItem>
                    <SelectItem value="super_admin">超级管理员</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit">更新</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 重置密码对话框 */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>
              为用户 {selectedUser?.username} 重置密码
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">新密码</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit">重置密码</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 仅超级管理员可访问
export default function UserManagementPage() {
  return (
    <SuperAdminGuard>
      <UserManagementContent />
    </SuperAdminGuard>
  );
}
