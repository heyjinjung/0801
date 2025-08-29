'use client';
// NOTE: 이 파일은 데모/프로토타입 UI입니다.
// 실제 상점 관리는 AdminPanel의 Shop CRUD 패널로 통합되었으며,
// 후속 작업으로 본 컴포넌트를 OpenAPI 연동형으로 전환/통합하거나 제거할 예정입니다.

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Filter,
  Download,
  Upload,
  Save,
  X,
  Package,
  DollarSign,
  TrendingUp,
  Tag,
  Image as ImageIcon
} from 'lucide-react';
import { ShopItem } from '../../types/admin';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
  import { Label } from '../ui/Label';

interface ShopManagerProps {
  onAddNotification: (message: string) => void;
}

export function ShopManager({ onAddNotification }: ShopManagerProps) {
  const [shopItems, setShopItems] = useState([] as ShopItem[]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all' as string);
  const [showCreateModal, setShowCreateModal] = useState(false as boolean);
  const [editingItem, setEditingItem] = useState(null as ShopItem | null);
  const [isLoading, setIsLoading] = useState(false as boolean);

  // Mock shop items
  useEffect(() => {
    const mockItems: ShopItem[] = [
      {
        id: '1',
        name: '골든 스킨 팩',
        description: '화려한 골든 테마의 스킨 컬렉션',
        price: 50000,
        category: 'skin',
        rarity: 'legendary',
        isActive: true,
        stock: 100,
        discount: 20,
        icon: '✨',
        createdAt: new Date('2024-12-01'),
        updatedAt: new Date('2024-12-30'),
        sales: 234,
        tags: ['golden', 'premium', 'limited']
      },
      {
        id: '2',
        name: '더블 경험치 부스터',
        description: '1시간 동안 경험치 2배 획득',
        price: 10000,
        category: 'powerup',
        rarity: 'rare',
        isActive: true,
        stock: 500,
        icon: '⚡',
        createdAt: new Date('2024-11-15'),
        updatedAt: new Date('2024-12-28'),
        sales: 567,
        tags: ['boost', 'exp', 'temporary']
      },
      {
        id: '3',
        name: '럭키 코인',
        description: '행운 확률을 일시적으로 증가시킵니다',
        price: 25000,
        category: 'powerup',
        rarity: 'epic',
        isActive: false,
        stock: 50,
        icon: '🍀',
        createdAt: new Date('2024-12-20'),
        updatedAt: new Date('2024-12-29'),
        sales: 89,
        tags: ['luck', 'rare', 'gambling']
      }
    ];
    setShopItems(mockItems);
  }, []);

  // Filter items
  const filteredItems = shopItems.filter((item: ShopItem) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.tags.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  // Handle create/edit item
  const handleSaveItem = async (itemData: Partial<ShopItem>) => {
    setIsLoading(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (editingItem) {
        // Update existing item
        setShopItems((prev: ShopItem[]) => prev.map((item: ShopItem) => 
          item.id === editingItem.id 
            ? { ...item, ...itemData, updatedAt: new Date() }
            : item
        ));
        onAddNotification(`✅ "${itemData.name}" 아이템이 수정되었습니다.`);
      } else {
        // Create new item
        const newItem: ShopItem = {
          id: Date.now().toString(),
          name: itemData.name || '',
          description: itemData.description || '',
          price: itemData.price || 0,
          category: itemData.category || 'skin',
          rarity: itemData.rarity || 'common',
          isActive: itemData.isActive ?? true,
          stock: itemData.stock,
          discount: itemData.discount,
          icon: itemData.icon || '📦',
          createdAt: new Date(),
          updatedAt: new Date(),
          sales: 0,
          tags: itemData.tags || []
        };
        
  setShopItems((prev: ShopItem[]) => [newItem, ...prev]);
        onAddNotification(`✅ "${newItem.name}" 아이템이 생성되었습니다.`);
      }
      
      setShowCreateModal(false);
      setEditingItem(null);
    } catch (error) {
      onAddNotification('❌ 아이템 저장에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle delete item
  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('정말로 이 아이템을 삭제하시겠습니까?')) return;
    
    setIsLoading(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
  setShopItems((prev: ShopItem[]) => prev.filter((item: ShopItem) => item.id !== itemId));
      onAddNotification('🗑️ 아이템이 삭제되었습니다.');
    } catch (error) {
      onAddNotification('❌ 아이템 삭제에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle item active status
  const toggleItemStatus = async (itemId: string) => {
    setShopItems((prev: ShopItem[]) => prev.map((item: ShopItem) => 
      item.id === itemId 
        ? { ...item, isActive: !item.isActive, updatedAt: new Date() }
        : item
    ));
    
    const item = shopItems.find((i: ShopItem) => i.id === itemId);
    onAddNotification(`${item?.isActive ? '⏸️' : '▶️'} "${item?.name}" 상태가 변경되었습니다.`);
  };

  // Get rarity color
  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'common': return 'text-muted-foreground';
      case 'rare': return 'text-info';
      case 'epic': return 'text-primary';
      case 'legendary': return 'text-gold';
      case 'mythic': return 'text-gradient-primary';
      default: return 'text-muted-foreground';
    }
  };

  const categories = [
    { value: 'skin', label: '스킨' },
    { value: 'powerup', label: '파워업' },
    { value: 'currency', label: '화폐' },
    { value: 'collectible', label: '수집품' },
    { value: 'character', label: '캐릭터' },
    { value: 'weapon', label: '무기' }
  ];

  const rarities = [
    { value: 'common', label: '일반' },
    { value: 'rare', label: '희귀' },
    { value: 'epic', label: '영웅' },
    { value: 'legendary', label: '전설' },
    { value: 'mythic', label: '신화' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">상점 관리</h2>
          <p className="text-muted-foreground">아이템 추가, 수정, 삭제 및 재고 관리</p>
        </div>
        
        <div className="flex gap-3">
          <Button variant="outline" className="btn-hover-lift">
            <Download className="w-4 h-4 mr-2" />
            내보내기
          </Button>
          <Button variant="outline" className="btn-hover-lift">
            <Upload className="w-4 h-4 mr-2" />
            가져오기
          </Button>
          <Button 
            onClick={() => setShowCreateModal(true)}
            className="bg-gradient-game btn-hover-lift"
          >
            <Plus className="w-4 h-4 mr-2" />
            아이템 추가
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-soft rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{shopItems.length}</div>
                <div className="text-sm text-muted-foreground">총 아이템</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-success-soft rounded-lg flex items-center justify-center">
                <Eye className="w-5 h-5 text-success" />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">
                  {shopItems.filter((item: ShopItem) => item.isActive).length}
                </div>
                <div className="text-sm text-muted-foreground">활성 아이템</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gold-soft rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-gold" />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">
                  {shopItems.reduce((sum: number, item: ShopItem) => sum + (item.sales * item.price), 0).toLocaleString()}G
                </div>
                <div className="text-sm text-muted-foreground">총 매출</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-info-soft rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-info" />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">
                  {shopItems.reduce((sum: number, item: ShopItem) => sum + item.sales, 0).toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">총 판매량</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="아이템 검색..."
            value={searchQuery}
            onChange={(e: React.FormEvent<HTMLInputElement>) => setSearchQuery((e.currentTarget as HTMLInputElement).value)}
            className="pl-10"
          />
        </div>
        
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 카테고리</SelectItem>
            {categories.map(category => (
              <SelectItem key={category.value} value={category.value}>
                {category.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Items Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
  {filteredItems.map((item: ShopItem, index: number) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="glass-effect rounded-xl p-6 card-hover-float"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="text-3xl">{item.icon}</div>
                <div>
                  <h3 className="font-bold text-foreground">{item.name}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              </div>
              
              <Switch
                checked={item.isActive}
                onCheckedChange={() => toggleItemStatus(item.id)}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">가격</span>
                <div className="flex items-center gap-2">
                  {item.discount && (
                    <span className="text-xs text-error line-through">
                      {item.price.toLocaleString()}G
                    </span>
                  )}
                  <span className="font-bold text-gold">
                    {Math.floor(item.price * (1 - (item.discount || 0) / 100)).toLocaleString()}G
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">희귀도</span>
                <Badge className={getRarityColor(item.rarity)}>
                  {rarities.find(r => r.value === item.rarity)?.label}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">판매량</span>
                <span className="font-medium text-foreground">{item.sales.toLocaleString()}</span>
              </div>

              {item.stock !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">재고</span>
                  <span className={`font-medium ${item.stock < 10 ? 'text-error' : 'text-foreground'}`}>
                    {item.stock}
                  </span>
                </div>
              )}

              {item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.tags.slice(0, 3).map(tag => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {item.tags.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{item.tags.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4 pt-4 border-t border-border-secondary">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingItem(item);
                  setShowCreateModal(true);
                }}
                className="flex-1"
              >
                <Edit className="w-4 h-4 mr-1" />
                수정
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDeleteItem(item.id)}
                className="border-error text-error hover:bg-error hover:text-white"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      <ItemModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingItem(null);
        }}
        onSave={handleSaveItem}
        editingItem={editingItem}
        isLoading={isLoading}
        categories={categories}
        rarities={rarities}
      />
    </div>
  );
}

// Item Modal Component
interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (itemData: Partial<ShopItem>) => void;
  editingItem: ShopItem | null;
  isLoading: boolean;
  categories: Array<{ value: string; label: string }>;
  rarities: Array<{ value: string; label: string }>;
}

function ItemModal({ 
  isOpen, 
  onClose, 
  onSave, 
  editingItem, 
  isLoading, 
  categories, 
  rarities 
}: ItemModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 0,
    category: 'skin',
    rarity: 'common',
    isActive: true,
    icon: '📦',
    tags: []
  } as Partial<ShopItem>);

  useEffect(() => {
    if (editingItem) {
      setFormData(editingItem);
    } else {
      setFormData({
        name: '',
        description: '',
        price: 0,
        category: 'skin',
        rarity: 'common',
        isActive: true,
        icon: '📦',
        tags: []
      });
    }
  }, [editingItem, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          onClick={(e: any) => e.stopPropagation()}
          className="glass-effect rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-foreground">
              {editingItem ? '아이템 수정' : '새 아이템 추가'}
            </h3>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">아이템 이름 *</Label>
                <Input
                  id="name"
                  value={formData.name || ''}
                  onChange={(e: any) => setFormData((prev: Partial<ShopItem>) => ({ ...prev, name: e.target.value }))}
                  placeholder="아이템 이름을 입력하세요"
                  required
                />
              </div>

              <div>
                <Label htmlFor="icon">아이콘 *</Label>
                <Input
                  id="icon"
                  value={formData.icon || ''}
                  onChange={(e: any) => setFormData((prev: Partial<ShopItem>) => ({ ...prev, icon: e.target.value }))}
                  placeholder="📦"
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">설명</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e: any) => setFormData((prev: Partial<ShopItem>) => ({ ...prev, description: e.target.value }))}
                placeholder="아이템 설명을 입력하세요"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="price">가격 (골드) *</Label>
                <Input
                  id="price"
                  type="number"
                  value={formData.price || 0}
                  onChange={(e: any) => setFormData((prev: Partial<ShopItem>) => ({ ...prev, price: parseInt(e.target.value) || 0 }))}
                  placeholder="0"
                  min="0"
                  required
                />
              </div>

              <div>
                <Label htmlFor="stock">재고 (선택)</Label>
                <Input
                  id="stock"
                  type="number"
                  value={formData.stock || ''}
                  onChange={(e: any) => setFormData((prev: Partial<ShopItem>) => ({ ...prev, stock: e.target.value ? parseInt(e.target.value) : undefined }))}
                  placeholder="무제한"
                  min="0"
                />
              </div>

              <div>
                <Label htmlFor="discount">할인율 (%)</Label>
                <Input
                  id="discount"
                  type="number"
                  value={formData.discount || ''}
                  onChange={(e: any) => setFormData((prev: Partial<ShopItem>) => ({ ...prev, discount: e.target.value ? parseInt(e.target.value) : undefined }))}
                  placeholder="0"
                  min="0"
                  max="100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">카테고리 *</Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(value: string) => setFormData((prev: Partial<ShopItem>) => ({ ...prev, category: value }))}        
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(category => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="rarity">희귀도 *</Label>
                <Select 
                  value={formData.rarity} 
                  onValueChange={(value: string) => setFormData((prev: Partial<ShopItem>) => ({ ...prev, rarity: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rarities.map(rarity => (
                      <SelectItem key={rarity.value} value={rarity.value}>
                        {rarity.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="tags">태그 (쉼표로 구분)</Label>
              <Input
                id="tags"
                value={Array.isArray(formData.tags) ? formData.tags.join(', ') : ''}
                onChange={(e: any) => setFormData((prev: Partial<ShopItem>) => ({ 
                  ...prev, 
                  tags: e.target.value.split(',').map((tag: string) => tag.trim()).filter(Boolean)
                }))}
                placeholder="태그1, 태그2, 태그3"
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={formData.isActive ?? true}
                onCheckedChange={(checked: boolean) => setFormData((prev: Partial<ShopItem>) => ({ ...prev, isActive: checked }))}
              />
              <Label>아이템 활성화</Label>
            </div>

            <div className="flex gap-3 pt-4 border-t border-border-secondary">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isLoading}
                className="flex-1"
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-gradient-game btn-hover-lift"
              >
                <Save className="w-4 h-4 mr-2" />
                {isLoading ? '저장 중...' : (editingItem ? '수정' : '생성')}
              </Button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}